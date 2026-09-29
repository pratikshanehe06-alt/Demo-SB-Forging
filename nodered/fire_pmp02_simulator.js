// ============================================================================
// Fire pump simulator (Main Pump 1 / PMP-02) — Node-RED "function" node.
// Posts to POST http://localhost:8000/api/fire/telemetry/ingest
//
// Server rules (backend/server.py _derive_fire_status):
//   pressure_bar < 5  -> ATTENTION      pressure_bar < 3  -> ALARM (+ fire alarm event)
//   motor_temp_c > 80 -> ATTENTION      motor_temp_c > 95 -> FAULT (+ fire alarm event)
//   Health recovers when readings go back to normal.
//
// Controls (inject nodes):
//   msg.reset    = true                          -> back to DEFAULTS
//   msg.override = {"pressure_bar":4.2}          -> set & HOLD pressure (~4.2)
//   msg.override = {"motor_temp_c":98}           -> set & HOLD motor temperature
//   msg.override = {"running":true}              -> start pump (flow, current, rpm rise)
//   msg.override = {"running":false}             -> stop pump
// ============================================================================

const ASSET_CODE = "PMP-02";                 // change to target another fire asset
const INGEST_KEY = "8d2fd7f45f224f766af0b8bb4ae6edc00d779e4472a946a4"; // backend/.env
const STATE_KEY  = "fire_pmp02_state";
const INTERVAL_S = 5;

const DEFAULTS = {
    running: false,        // main pumps sit on standby until demand
    pressure_bar: 7.1,     // line pressure held by the jockey pump
    motor_temp_c: 38,
    flow_lpm: 0,
    current_a: 0,
    rpm: 0,
    runtime_min_today: 0
};

let state = (msg.reset ? null : flow.get(STATE_KEY)) || { ...DEFAULTS, _runtime_s: 0 };

if (msg.override && typeof msg.override === "object") {
    Object.assign(state, msg.override);
    if (msg.override.pressure_bar !== undefined) state.target_pressure = Number(msg.override.pressure_bar);
    if (msg.override.motor_temp_c !== undefined) state.target_temp = Number(msg.override.motor_temp_c);
}
const isManual = Boolean(msg.reset || msg.override);

const jitter = (v, d) => v + (Math.random() * 2 - 1) * d;
const r = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;

if (!isManual) {
    const running = Boolean(state.running);
    const tP = state.target_pressure ?? (running ? 7.8 : DEFAULTS.pressure_bar);
    const tT = state.target_temp ?? (running ? 62 : DEFAULTS.motor_temp_c);
    state.pressure_bar += (tP - state.pressure_bar) * 0.3;
    state.motor_temp_c += (tT - state.motor_temp_c) * 0.15;
    state.pressure_bar = Math.max(0, jitter(state.pressure_bar, 0.05));
    state.motor_temp_c = jitter(state.motor_temp_c, 0.3);

    if (running) {
        state.rpm       = jitter(2950, 10);
        state.flow_lpm  = Math.max(0, jitter(1200, 25));
        state.current_a = Math.max(0, jitter(88, 1.5));
        state._runtime_s += INTERVAL_S;
    } else {
        state.rpm = 0; state.flow_lpm = 0; state.current_a = 0;
    }
    state.runtime_min_today = Math.floor(state._runtime_s / 60);
}

flow.set(STATE_KEY, state);
node.status({
    fill: state.pressure_bar < 3 || state.motor_temp_c > 95 ? "red"
        : state.pressure_bar < 5 || state.motor_temp_c > 80 ? "yellow" : "green",
    shape: "dot",
    text: `${state.running ? "RUNNING" : "STANDBY"} · ${r(state.pressure_bar)} bar · ${r(state.motor_temp_c, 1)}°C`
});

msg.payload = {
    asset_code: ASSET_CODE,
    metrics: {
        running: Boolean(state.running),
        pressure_bar: r(state.pressure_bar),
        motor_temp_c: r(state.motor_temp_c, 1),
        flow_lpm: Math.round(state.flow_lpm),
        current_a: r(state.current_a, 1),
        rpm: Math.round(state.rpm),
        runtime_min_today: state.runtime_min_today
    }
};
msg.headers = { "Content-Type": "application/json", "X-Ingest-Key": INGEST_KEY };
delete msg.reset;
delete msg.override;
return msg;
