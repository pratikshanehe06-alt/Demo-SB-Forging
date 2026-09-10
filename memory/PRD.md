# CoreOT Platform Suite — APM Module PRD

## Original problem statement (scoped)
User asked for CoreOT platform. For iteration 1 they narrowed scope to:
"I want frontend and backend for APM module only and tenant login, other I need to show frontend and format of the design I'm attaching." Plus a Node-RED telemetry backend they can control during the client demo.

## Architecture
- **Backend**: FastAPI + Motor (MongoDB). JWT auth. WebSocket broadcast per tenant. HTTP `/api/telemetry/ingest` receives Node-RED payloads.
- **Frontend**: React (CRA) + Tailwind + shadcn/ui + Recharts + framer-motion. Chivo/IBM Plex Sans/Mono fonts.
- **Simulator**: Built-in background task tickles CNC-DEMO-01 telemetry every 5 s.
- **Node-RED**: Provided flow at `/app/coreot_nodered_flow.json` and guide at `/app/COREOT_NODERED_GUIDE.md`.

## Personas
- Tenant Admin (primary user for demo)
- CXO / Production Manager / Supervisor / Operator (seeded, share Tenant Admin dashboard for now — role-scoped UI is P1)

## Implemented (2026-02)
- Login (tenant + email + password) with demo-account quick-fill
- Tenant Admin Dashboard: 6 KPIs, Assets by Area bar, Asset Health donut, Alarms Trend, Recent Alarms, Top Faulty Assets
- Asset List with Area/Type/Status filters, pagination, Add Asset dialog, row → Asset 360
- Asset Hierarchy tree (Plant → Area → Asset)
- Asset 360 with health gauge, digital-twin animation, 8 live telemetry cards, live trend chart, WebSocket live indicator
- POST /api/telemetry/ingest (Node-RED / OT ingress) with automatic status + health derivation from temperature and alarm flags
- Seeded: SBF tenant, 5 users, Pune Plant, 4 areas, 45 assets (incl. CNC-DEMO-01), 12 alarms
- 26 backend pytest cases pass, end-to-end frontend flows verified

## Prioritized backlog
- **P1**: Role-scoped UIs (CXO / Production Manager / Supervisor / Operator dashboards)
- **P1**: Users, Roles & Permissions CRUD
- **P1**: Alarms page (acknowledge, filter, history)
- **P1**: Ingest key / mTLS on /api/telemetry/ingest (production hardening)
- **P2**: EEMS / OEE / Digital Twin / AI Copilot modules
- **P2**: Reports export (CSV/Excel/PDF)
- **P2**: MQTT bridge to replace HTTP ingest, TimescaleDB migration for telemetry
- **P2**: DELETE + soft-deactivate asset endpoint
