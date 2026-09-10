# CoreOT × Node-RED — Live Demo Guide

CoreOT receives live machine data via one HTTP endpoint. Node-RED posts JSON to
it, FastAPI stores the value and pushes it to every connected browser through
a WebSocket, and the CoreOT React app re-renders without a page refresh.

## 0. Grab your INGEST_KEY

The backend auto-generates a strong key on first boot and stores it at
`backend/.env` under `INGEST_KEY="…"`. Read it once:

```bash
grep INGEST_KEY /app/backend/.env
# INGEST_KEY="8d2fd7f45f224f766af0b8bb4ae6edc00d779e4472a946a4"
```

Rotate at any time by deleting that line and restarting the backend — a new key
is generated. A tenant admin can also fetch a masked hint from
`GET /api/ingest/key-hint`.

## 1. Ingest endpoint

```
POST {BACKEND_URL}/api/telemetry/ingest
Content-Type: application/json
X-Ingest-Key: {INGEST_KEY}
```

`401` is returned if the header is missing or wrong. Body (any subset;
identify the asset via `asset_code` or `asset_id`):

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

Server-side rules:

- `machine_status`: `RUNNING / STOPPED / IDLE / FAULT` maps directly; `ON`→RUNNING, `OFF`→OFFLINE.
- `temperature > 85` → status **WARNING**; `> 100` → status **CRITICAL**.
- `alarm: true` → creates an alarm with `alarm_message` and sets status **FAULT**.
- Any critical alarm still unacknowledged after 5 minutes is auto-escalated
  (logged to `/api/escalations`, red badge in the CoreOT header).

## 2. Run Node-RED locally

```bash
npm install -g --unsafe-perm node-red node-red-dashboard
node-red
# Editor:    http://localhost:1880
# Dashboard: http://localhost:1880/ui
```

## 3. Import the demo flow

1. Open `/app/coreot_nodered_flow.json`.
2. Replace `CHANGE_ME_BACKEND_URL` with your CoreOT backend base URL
   (locally `http://localhost:8001`, or the value of `REACT_APP_BACKEND_URL`
   from `/app/frontend/.env` when running on the preview host).
3. Replace `REPLACE_WITH_INGEST_KEY` with the value from `backend/.env`.
4. In Node-RED: **Menu → Import → paste JSON → Import → Deploy**.
5. Open the dashboard at `http://localhost:1880/ui`.

Dashboard controls:

- **Machine Status** dropdown — RUNNING / STOPPED / IDLE / FAULT
- **Temperature** slider (20–120 °C)
- **Vibration / RPM / Power** sliders
- **Production / Good / Reject** counters
- **Alarm** toggle
- **Auto simulate (5 s)** inject — realistic physics without touching the UI

Every change POSTs the latest state to CoreOT. On the CoreOT Asset 360 page for
CNC-DEMO-01, each field flashes blue when its value changes.

## 4. Client demo script

1. Sign in as **Tenant Admin** (`tenantadmin@sbforgtech.com` / `Admin@123`, tenant `SBF`).
2. Show the dashboard KPIs, health donut, alarms trend, faulty asset list.
3. Navigate to **Assets → CNC-DEMO-01 → Asset 360**.
4. Switch to the Node-RED dashboard. Push **Temperature** from 62 → 92. Watch
   Asset 360's Temperature card flash and the status pill turn **WARNING**.
5. Push Temperature to 105. Status flips to **CRITICAL** and a new alarm
   appears in the header bell + dashboard "Recent Alarms".
6. Wait 5 minutes without acknowledging — the shield-alert icon in the header
   shows a red badge and lists the escalation. Or drop `ESCALATION_MINUTES=1`
   in `backend/.env` for a faster demo.
7. Set Status to **STOPPED** → RPM zero, digital-twin animation stops.
8. Recover: Status **RUNNING**, Temperature back to 60, Alarm off.
9. Sign out and back in as **CXO** — different landing (`/cxo`) with the
   Comparison Board across Pune / Mumbai / Nashik plants.
10. Sign in as **Operator** — a stripped-down runbook shows only CNC-DEMO-01,
    live parameters, batch-entry form and one-tap alarm acknowledge.

## 5. Curl smoke test (no Node-RED)

```bash
IK=$(grep INGEST_KEY /app/backend/.env | cut -d= -f2 | tr -d '"')
curl -s -X POST $REACT_APP_BACKEND_URL/api/telemetry/ingest \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: $IK" \
  -d '{"asset_code":"CNC-DEMO-01","machine_status":"RUNNING","temperature":95,"rpm":1500,"power":10.5}' | jq
```

## 6. Production hardening notes

- Replace HTTP ingest with the platform's MQTT bridge
  (`coreot/{tenant}/{plant}/{asset}/telemetry`).
- Move `INGEST_KEY` to a secret store, rotate on a schedule.
- Node-RED should sit inside an OT DMZ, never facing the public internet.
- Swap the log-only escalation notifier for Twilio SMS, Slack, or Telegram in
  `escalation_scanner()` inside `backend/server.py`.
