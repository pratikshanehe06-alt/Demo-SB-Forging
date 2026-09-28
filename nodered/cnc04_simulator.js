// ============================================================================
// CNC-04 simulator — paste into a Node-RED "function" node.
// Wiring:  [inject every 5s] ─┐
//          [inject: Reset]  ──┼─► [this function] ─► [http request POST] ─► [debug]
//          [inject: Temp 95] ─┘
//
// http request node: Method = POST, URL = http://localhost:8000/api/telemetry/ingest,
//                    Return = a parsed JSON object. Leave its Headers list empty
//                    (headers come from msg.headers below).
//
// Controls (set on an inject node):
//   msg.reset    = true                               -> restart from DEFAULTS
//   msg.override = {"temperature":95}                 -> set & HOLD temperature at ~95
//   msg.override = {"machine_status":"STOPPED"}       -> stop the machine
//   msg.override = {"machine_status":"RUNNING","temperature":60}  -> recover
// ============================================================================

const ASSET_CODE = "CNC-04";
const INGEST_KEY = "8d2fd7f45f224f766af0b8bb4ae6edc00d779e4472a946a4"; // from backend/.env
const STATE_KEY  = "cnc04_state";
const INTERVAL_S = 5;          // must match the repeating inject interval
const FAULT_CHANCE = 0.05;     // 5% chance per tick to fault while RUNNING
const RECOVER_CHANCE = 0.2;    // 20% chance per tick to recover from FAULT
const AUTO_FAULTS = false;     // set false to only fault via overrides

const DEFAULTS = {
    temperature: 62.0,     // normal. Server rules: >85 WARNING, >100 CRITICAL
    vibration: 2.5,        // >8 WARNING, >12 CRITICAL
    pressure: 5.0,
    rpm: 1400,
    voltage: 415,
    current: 11.8,
    power: 8.2,
    energy: 100.0,
    production_count: 500,
    good_count: 485,
    reject_count: 15,
    machine_status: "RUNNING"
};

// ---- load state (reset / override) ----------------------------------------
let state = (msg.reset ? null : flow.get(STATE_KEY)) || { ...DEFAULTS };

if (msg.override && typeof msg.override === "object") {
    Object.assign(state, msg.override);
    // Overridden temperature/vibration become the new target, so they hold
    // (with small jitter) instead of drifting back to the defaults.
    if (msg.override.temperature !== undefined) state.target_temperature = Number(msg.override.temperature);
    if (msg.override.vibration !== undefined) state.target_vibration = Number(msg.override.vibration);
    if (state.machine_status) state.machine_status = String(state.machine_status).toUpperCase();
}
const isManual = Boolean(msg.reset || msg.override);

// ---- helpers ---------------------------------------------------------------
const jitter = (val, delta) => val + (Math.random() * 2 - 1) * delta;
const clamp  = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2     = (v) => Math.round(v * 100) / 100;

// ---- random fault / recovery (only on timer ticks, not manual pushes) -----
if (!isManual && AUTO_FAULTS) {
    if (state.machine_status === "RUNNING" && Math.random() < FAULT_CHANCE) {
        state.machine_status = "FAULT";
    } else if (state.machine_status === "FAULT" && Math.random() < RECOVER_CHANCE) {
        state.machine_status = "RUNNING";
        state.temperature = (state.target_temperature ?? DEFAULTS.temperature) + Math.random() * 3;
        state.vibration = (state.target_vibration ?? DEFAULTS.vibration) + Math.random() * 0.5;
    }
}

// ---- physics ---------------------------------------------------------------
if (!isManual) {
    if (state.machine_status === "RUNNING") {
        // drift toward target (your override, else the default) so values don't random-walk
        const tT = state.target_temperature ?? DEFAULTS.temperature;
        const tV = state.target_vibration ?? DEFAULTS.vibration;
        state.temperature += (tT - state.temperature) * 0.2;
        state.vibration   += (tV - state.vibration) * 0.2;

        state.temperature = clamp(jitter(state.temperature, 0.6), 20, 150);
        state.vibration   = clamp(jitter(state.vibration, 0.25), 0.1, 20);
        state.rpm         = clamp(jitter(state.rpm || DEFAULTS.rpm, 15), 1200, 1600);
        state.voltage     = jitter(415, 2);
        state.current     = Math.max(5, jitter(state.current, 0.3));
        state.power       = Math.max(4, jitter(state.power, 0.4));
        state.pressure    = Math.max(1, jitter(state.pressure, 0.15));
        state.energy     += state.power / 3600 * INTERVAL_S;

        if (Math.random() < 0.5) {
            state.production_count += 1;
            if (Math.random() > 0.05) state.good_count += 1;
            else state.reject_count += 1;
        }
    } else if (state.machine_status === "FAULT") {
        state.temperature = Math.min(110, state.temperature + 1.5);
        state.vibration   = Math.min(15, state.vibration + 0.5);
        state.rpm         = Math.max(0, state.rpm - 200);
        state.power       = Math.max(0.5, state.power * 0.7);
    } else {
        // STOPPED / IDLE: machine cools down, spindle stops
        state.temperature += (30 - state.temperature) * 0.05;
        state.vibration   = Math.max(0.1, state.vibration * 0.8);
        state.rpm         = 0;
        state.power       = state.machine_status === "IDLE" ? 1.2 : 0;
        state.current     = state.machine_status === "IDLE" ? 2.0 : 0;
    }
}

// Raise an alarm only on the tick the machine enters FAULT (not every 5s).
const justFaulted = state.machine_status === "FAULT" && state._prev_status !== "FAULT";
state._prev_status = state.machine_status;

flow.set(STATE_KEY, state);
node.status({
    fill: state.machine_status === "RUNNING" ? "green" : state.machine_status === "FAULT" ? "red" : "grey",
    shape: "dot",
    text: `${state.machine_status} · ${r2(state.temperature)}°C · ${r2(state.vibration)} mm/s`
});

// ---- payload ---------------------------------------------------------------
const payload = {
    asset_code: ASSET_CODE,
    machine_status: state.machine_status,
    temperature: r2(state.temperature),
    vibration: r2(state.vibration),
    pressure: r2(state.pressure),
    rpm: Math.round(state.rpm),
    voltage: Math.round(state.voltage * 10) / 10,
    current: r2(state.current),
    power: r2(state.power),
    energy: r2(state.energy),
    production_count: state.production_count,
    good_count: state.good_count,
    reject_count: state.reject_count,
    alarm: justFaulted
};
if (payload.alarm) payload.alarm_message = `Simulated fault on ${ASSET_CODE}`;

msg.payload = payload;
msg.headers = {
    "Content-Type": "application/json",
    "X-Ingest-Key": INGEST_KEY
};
delete msg.reset;
delete msg.override;
return msg;
