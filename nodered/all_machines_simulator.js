// ============================================================================
// ALL APM MACHINES simulator — Node-RED "function" node (1 output).
// Every tick it builds one POST per machine from the asset list the
// "Load asset list" node stored in flow context ('apm_assets').
//
// Controls (inject nodes into this function):
//   msg.reset  = true                                       -> reset every machine
//   msg.target = "Press-01", msg.override = {"temperature":95}   -> hold temp on one machine
//   msg.target = "*",        msg.override = {"machine_status":"RUNNING"} -> apply to all
//   msg.target = "Press-01", msg.reset = true               -> reset one machine
// Server rules: temperature >85 WARNING, >100 CRITICAL; vibration >8 WARNING, >12 CRITICAL.
// ============================================================================

const BACKEND    = "http://localhost:8000";
const INGEST_KEY = "8d2fd7f45f224f766af0b8bb4ae6edc00d779e4472a946a4"; // backend/.env
const INTERVAL_S = 10;   // must match the repeating inject
// CNC-04 has its own flow; CNC-DEMO-01 is already driven by the backend simulator.
const EXCLUDE = ["CNC-04", "CNC-DEMO-01"];

// Normal operating values per asset_type (kept below the warning thresholds)
const PROFILES = {
    "CNC Machine":       { temperature: 62, vibration: 2.5, pressure: 5.4, rpm: 1450, voltage: 415, current: 12.4, power: 8.7,  produces: true },
    "Hydraulic Press":   { temperature: 55, vibration: 3.2, pressure: 180, rpm: 1480, voltage: 415, current: 38,   power: 22,   produces: true },
    "Forging Hammer":    { temperature: 68, vibration: 6.0, pressure: 8.0, rpm: 960,  voltage: 415, current: 80,   power: 45,   produces: true },
    "Induction Furnace": { temperature: 72, vibration: 1.2, flow: 180,     voltage: 690, current: 360,  power: 250 },
    "Quench Tank":       { temperature: 45, vibration: 0.6, flow: 400,     voltage: 415, current: 9,    power: 5.5 },
    "Tempering Oven":    { temperature: 70, vibration: 0.8, rpm: 720,      voltage: 415, current: 95,   power: 60 },
    "Air Compressor":    { temperature: 76, vibration: 3.6, pressure: 7.5, rpm: 2950, voltage: 415, current: 64,   power: 37 },
    "Water Chiller":     { temperature: 12, vibration: 1.6, pressure: 4.0, flow: 900,  voltage: 415, current: 52, power: 30 },
    "Cooling Tower":     { temperature: 32, vibration: 2.0, flow: 1500,    rpm: 480,  voltage: 415, current: 26,   power: 15 },
    "Overhead Crane":    { temperature: 40, vibration: 1.5, voltage: 415,  current: 20,   power: 11 },
    "Conveyor":          { temperature: 38, vibration: 1.2, rpm: 90,       voltage: 415, current: 10,   power: 5.5 },
    "_default":          { temperature: 50, vibration: 2.0, voltage: 415,  current: 15,   power: 10 }
};
const NUMERIC = ["temperature", "vibration", "pressure", "rpm", "voltage", "current", "power", "flow"];
const JITTER  = { temperature: 0.5, vibration: 0.2, pressure: 0.02, rpm: 0.01, voltage: 0.005, current: 0.02, power: 0.03, flow: 0.02 }; // abs for temp/vib, relative for others

const assets = (flow.get("apm_assets") || []).filter(a => !EXCLUDE.includes(a.asset_code));
if (!assets.length) { node.status({ fill: "yellow", shape: "ring", text: "no asset list yet" }); return null; }

let states = flow.get("apm_states") || {};
const r2 = v => Math.round(v * 100) / 100;

function fresh(a) {
    const p = PROFILES[a.asset_type] || PROFILES._default;
    const s = { machine_status: ["RUNNING", "IDLE", "FAULT", "OFFLINE", "STOPPED"].includes(a.status) ? a.status : "RUNNING",
                energy: 100 + Math.random() * 400, production_count: 0, good_count: 0, reject_count: 0, targets: {} };
    NUMERIC.forEach(k => { if (p[k] !== undefined) s[k] = p[k]; });
    if (s.machine_status === "WARNING" || s.machine_status === "CRITICAL") s.machine_status = "RUNNING";
    return s;
}

// ---- manual controls --------------------------------------------------------
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
        NUMERIC.forEach(k => { if (msg.override[k] !== undefined) s.targets[k] = Number(msg.override[k]); });
        if (s.machine_status) s.machine_status = String(s.machine_status).toUpperCase();
    });
}
const isManual = Boolean(msg.reset || msg.override);
const only = isManual && target && target !== "*" ? [target] : null;   // manual push: send just that machine

// ---- simulate + build messages ------------------------------------------------
const out = [];
let running = 0, faults = 0;
for (const a of assets) {
    if (only && !only.includes(a.asset_code)) continue;
    const p = PROFILES[a.asset_type] || PROFILES._default;
    const s = states[a.asset_code] || (states[a.asset_code] = fresh(a));
    if (s.machine_status === "OFFLINE") continue;          // offline machines stay silent

    if (!isManual) {
        const on = s.machine_status === "RUNNING";
        for (const k of NUMERIC) {
            if (p[k] === undefined) continue;
            let base = s.targets[k] ?? p[k];
            if (!on && ["rpm", "current", "power", "flow"].includes(k)) base = s.targets[k] ?? (s.machine_status === "IDLE" ? p[k] * 0.15 : 0);
            if (!on && k === "temperature" && s.targets[k] === undefined) base = Math.max(25, p[k] * 0.7);
            s[k] += (base - s[k]) * 0.25;
            const j = JITTER[k] ?? 0.02;
            const delta = (k === "temperature" || k === "vibration") ? j : Math.abs(base) * j;
            s[k] = Math.max(0, s[k] + (Math.random() * 2 - 1) * delta);
        }
        s.energy += (s.power || 0) / 3600 * INTERVAL_S;
        if (on && p.produces && Math.random() < 0.5) {
            s.production_count += 1;
            if (Math.random() > 0.04) s.good_count += 1; else s.reject_count += 1;
        }
    }
    if (s.machine_status === "RUNNING") running++;
    if (s.machine_status === "FAULT") faults++;

    const payload = { asset_code: a.asset_code, machine_status: s.machine_status, energy: r2(s.energy) };
    NUMERIC.forEach(k => { if (s[k] !== undefined) payload[k] = k === "rpm" ? Math.round(s[k]) : r2(s[k]); });
    if (p.produces) Object.assign(payload, { production_count: s.production_count, good_count: s.good_count, reject_count: s.reject_count });

    out.push({
        url: BACKEND + "/api/telemetry/ingest",
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Ingest-Key": INGEST_KEY },
        payload,
        asset_code: a.asset_code
    });
}

flow.set("apm_states", states);
node.status({ fill: faults ? "red" : "green", shape: "dot", text: `${out.length} sent · ${running} running · ${faults} fault` });
return [out];
