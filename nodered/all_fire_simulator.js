// ============================================================================
// ALL FIRE & SAFETY DEVICES simulator — Node-RED "function" node (1 output).
// Uses the fire asset list stored by "Load asset list" ('fire_assets').
//
// Controls:
//   msg.reset  = true                                             -> reset all devices
//   msg.target = "HYD-01", msg.override = {"pressure_bar":2.5}     -> hold a value on one device
//   msg.target = "TNK-01", msg.override = {"level_pct":30}
//   msg.target = "HTR-01", msg.override = {"hooter_on":true}
//   msg.target = "PMP-01", msg.override = {"running":false}
// Server rules: pressure <5 ATTENTION, <3 ALARM; motor_temp_c >80 ATTENTION, >95 FAULT;
//               tank level <40 ATTENTION, <20 ALARM; hooter_on -> ALARM.
// ============================================================================

const BACKEND    = "http://localhost:8000";
const INGEST_KEY = "8d2fd7f45f224f766af0b8bb4ae6edc00d779e4472a946a4"; // backend/.env
const INTERVAL_S = 10;
const EXCLUDE = ["PMP-02"];   // PMP-02 has its own flow

const r = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;
const jit = (v, d) => v + (Math.random() * 2 - 1) * d;

function fresh(a) {
    switch (a.asset_type) {
        case "FIRE_PUMP": {
            const jockey = /jockey/i.test(a.name || "");
            return { running: jockey, pressure_bar: 7.1, motor_temp_c: jockey ? 48 : 36, flow_lpm: 0, current_a: 0, rpm: 0, runtime_s: 0, targets: {} };
        }
        case "HYDRANT":          return { pressure_bar: 7.0, targets: {} };
        case "SPRINKLER_SYSTEM": return { pressure_bar: 6.5, zones_ready: 4, zones_total: 4, targets: {} };
        case "FIRE_WATER_TANK":  return { level_pct: 82, capacity_liters: 500000, targets: {} };
        case "HOOTER":           return { hooter_on: false, targets: {} };
        default:                 return { targets: {} };
    }
}

const assets = (flow.get("fire_assets") || []).filter(a => !EXCLUDE.includes(a.asset_code));
if (!assets.length) { node.status({ fill: "yellow", shape: "ring", text: "no fire asset list yet" }); return null; }
let states = flow.get("fire_states") || {};

const target = msg.target;
const matches = code => !target || target === "*" || target === code;
if (msg.reset) {
    if (!target || target === "*") states = {};
    else delete states[target];
}
if (msg.override && typeof msg.override === "object") {
    assets.filter(a => matches(a.asset_code)).forEach(a => {
        const s = states[a.asset_code] || (states[a.asset_code] = fresh(a));
        Object.assign(s, msg.override);
        ["pressure_bar", "motor_temp_c", "level_pct"].forEach(k => {
            if (msg.override[k] !== undefined) s.targets[k] = Number(msg.override[k]);
        });
    });
}
const isManual = Boolean(msg.reset || msg.override);
const only = isManual && target && target !== "*" ? target : null;

const out = [];
for (const a of assets) {
    if (only && only !== a.asset_code) continue;
    const s = states[a.asset_code] || (states[a.asset_code] = fresh(a));
    const t = s.targets;

    if (!isManual) {
        if (a.asset_type === "FIRE_PUMP") {
            s.pressure_bar += ((t.pressure_bar ?? (s.running ? 7.8 : 7.1)) - s.pressure_bar) * 0.3;
            s.motor_temp_c += ((t.motor_temp_c ?? (s.running ? 58 : 36)) - s.motor_temp_c) * 0.15;
            s.pressure_bar = Math.max(0, jit(s.pressure_bar, 0.05));
            s.motor_temp_c = jit(s.motor_temp_c, 0.3);
            if (s.running) { s.rpm = jit(2950, 10); s.flow_lpm = jit(1200, 25); s.current_a = jit(88, 1.5); s.runtime_s += INTERVAL_S; }
            else { s.rpm = 0; s.flow_lpm = 0; s.current_a = 0; }
        } else if (a.asset_type === "HYDRANT" || a.asset_type === "SPRINKLER_SYSTEM") {
            const base = t.pressure_bar ?? (a.asset_type === "HYDRANT" ? 7.0 : 6.5);
            s.pressure_bar = Math.max(0, jit(s.pressure_bar + (base - s.pressure_bar) * 0.3, 0.05));
        } else if (a.asset_type === "FIRE_WATER_TANK") {
            const base = t.level_pct ?? 82;
            s.level_pct = Math.min(100, Math.max(0, jit(s.level_pct + (base - s.level_pct) * 0.3, 0.1)));
        }
    }

    let metrics;
    switch (a.asset_type) {
        case "FIRE_PUMP":
            metrics = { running: Boolean(s.running), pressure_bar: r(s.pressure_bar), motor_temp_c: r(s.motor_temp_c, 1),
                        flow_lpm: Math.round(s.flow_lpm), current_a: r(s.current_a, 1), rpm: Math.round(s.rpm),
                        runtime_min_today: Math.floor(s.runtime_s / 60) };
            break;
        case "HYDRANT":          metrics = { pressure_bar: r(s.pressure_bar) }; break;
        case "SPRINKLER_SYSTEM": metrics = { pressure_bar: r(s.pressure_bar), zones_ready: s.zones_ready, zones_total: s.zones_total }; break;
        case "FIRE_WATER_TANK":  metrics = { level_pct: r(s.level_pct, 1), capacity_liters: s.capacity_liters }; break;
        case "HOOTER":           metrics = { hooter_on: Boolean(s.hooter_on) }; break;
        default:                 metrics = {};
    }

    out.push({
        url: BACKEND + "/api/fire/telemetry/ingest",
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Ingest-Key": INGEST_KEY },
        payload: { asset_code: a.asset_code, metrics },
        asset_code: a.asset_code
    });
}

flow.set("fire_states", states);
node.status({ fill: "green", shape: "dot", text: `${out.length} fire devices sent` });
return [out];
