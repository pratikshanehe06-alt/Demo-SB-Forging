# CoreOT × Node-RED — Live Demo Guide

The CoreOT web app receives live telemetry via a single HTTP endpoint. Node-RED
posts JSON to that endpoint; the FastAPI backend stores it, updates asset
status/health, and pushes the change over WebSocket. The React dashboard updates
without a refresh.

## 1. Ingest endpoint

```
POST {BACKEND_URL}/api/telemetry/ingest
Content-Type: application/json
```

**Body** (any subset of these fields; identify the asset via `asset_code` or
`asset_id`):

```json
{
  "asset_code": "CNC-DEMO-01",
  "machine_status": "RUNNING",
  "temperature": 62.5,
  "vibration": 2.8,
  "pressure": 5.4,
  "rpm": 1450,
  "voltage": 415,
  "current": 12.4,
  "power": 8.7,
  "energy": 126.8,
  "production_count": 640,
  "good_count": 625,
  "reject_count": 15,
  "alarm": false,
  "alarm_message": "Bearing overheat"
}
```

Backend rules:

- `machine_status` `RUNNING/STOPPED/IDLE/FAULT` maps directly. `ON`→RUNNING, `OFF`→OFFLINE.
- `temperature > 85` sets status to **WARNING**; `> 100` sets status to **CRITICAL**.
- `alarm: true` raises a **FAULT** and creates an alarm entry with `alarm_message`.

## 2. Run Node-RED locally

```bash
npm install -g node-red node-red-dashboard
node-red
# UI editor: http://localhost:1880
# Dashboard:  http://localhost:1880/ui
```

## 3. Import the demo flow

1. Open `/app/coreot_nodered_flow.json` in your editor.
2. Find the string `CHANGE_ME_BACKEND_URL` (one occurrence, inside the
   `http request` node) and replace it with your backend URL. Locally that's
   `http://localhost:8001`. On this platform it's the value of
   `REACT_APP_BACKEND_URL` from `/app/frontend/.env`.
3. In Node-RED: **Menu → Import → paste JSON → Import**.
4. Click **Deploy** (top-right).
5. Open the Dashboard tab at `http://localhost:1880/ui`.

You will see controls for:

- Machine Status (RUNNING / STOPPED / IDLE / FAULT)
- Temperature slider (20–120 °C)
- Vibration, RPM, Power sliders
- Production / Good / Reject counters
- Alarm toggle
- An "Auto simulate (5s)" inject that runs realistic physics automatically

Any change instantly POSTs the updated JSON to CoreOT. The `Asset 360` view for
`CNC-DEMO-01` will re-render telemetry with a subtle blue flash on every changed
field.

## 4. Demo script (client-facing)

1. Log in as **Tenant Admin** (`tenantadmin@sbforgtech.com` / `Admin@123`, tenant `SBF`).
2. Show the **Tenant Admin Dashboard** — KPI cards, Assets by Area, health donut, alarms trend.
3. Go to **Assets → CNC-DEMO-01 → Asset 360**.
4. Switch to Node-RED. Raise **Temperature** from 62 → 92. The Asset 360 card flashes and the top-status pill turns **WARNING**.
5. Push Temperature to 105. Status becomes **CRITICAL** and a critical alarm is generated (visible on the dashboard "Recent Alarms" widget).
6. Set Machine Status to **STOPPED**. RPM drops to 0, digital-twin animation stops, health tag falls.
7. Set Machine Status back to **RUNNING**, drop Temperature to 60, disable the Alarm toggle — the asset recovers to **RUNNING**.
8. Toggle the **Alarm** switch to raise a manual alarm and show it flowing into the dashboard's "Recent Alarms".

## 5. Curl smoke test (no Node-RED needed)

```bash
curl -s -X POST $REACT_APP_BACKEND_URL/api/telemetry/ingest \
  -H "Content-Type: application/json" \
  -d '{"asset_code":"CNC-DEMO-01","machine_status":"RUNNING","temperature":95,"rpm":1500,"power":10.5}' | jq
```

The Asset 360 page updates immediately if it is open.

## 6. Notes for production

- Replace HTTP ingest with the platform's MQTT bridge (`coreot/{tenant}/{plant}/{asset}/telemetry`).
- Add an `X-Ingest-Key` header check on `/api/telemetry/ingest` and configure it in Node-RED.
- Node-RED itself should sit inside the OT DMZ, never facing the internet directly.
