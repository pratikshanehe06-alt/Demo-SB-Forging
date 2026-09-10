# CoreOT Platform Suite — Product Requirements

## Original problem statement (scoped)
Full-stack multi-tenant Industrial IoT web app (CoreOT). Prototype covering:
- Tenant Admin dashboard, Asset Performance Management (APM) module, Asset 360 view, real-time telemetry
- Role-based access control (Super Admin, Tenant Admin, CXO, Production Manager, Supervisor, Operator)
- Mock machine ingestion via Node-RED → REST endpoint
- Reports & Forecasting (Feb 2026)

## Architecture
- Backend: FastAPI + Motor (MongoDB). JWT auth. WebSocket broadcast per tenant. `/api/telemetry/ingest` receives Node-RED payloads (X-Ingest-Key). Reports export via `reportlab`.
- Frontend: React (CRA) + Tailwind + shadcn/ui + Recharts + framer-motion.
- Simulator: background task nudges CNC-DEMO-01 telemetry every 5s.
- Node-RED: flow at `/app/coreot_nodered_flow.json` + `/app/COREOT_NODERED_GUIDE.md`.

## Personas
- Super Admin (Platform), Tenant Admin, CXO, Production Manager, Supervisor, Operator (all seeded).

## Implemented (chronological)
- **2026-02 iter 1–4**: Login (tenant + email + password), Tenant Admin dashboard, APM (Assets, Hierarchy, Asset 360 with live twin, MTBF/MTTR, Comparison), EEMS live page, OEE live page, Audit log, Users CRUD, Modules toggle UI, Super Admin platform portal, Operator Runbook, CXO Comparison Board, alarm auto-escalation, ingest-key guard.
- **2026-02 iter 5–6**: Threshold Editor per asset (Asset 360), Downtime Root-Cause chart, plant filter propagation.
- **2026-02 iter 7 — Reports & Forecasting**:
  - Backend `REPORTS` module (default ON, backfilled to existing tenants on startup)
  - `GET /api/reports/catalog` — 5 report types (Production, OEE, Energy, Downtime, Maintenance) with metrics + aggregations
  - `POST /api/reports/run` — daily / weekly / monthly aggregation, plant + asset filters, optional forecast (linear regression + 95% CI)
  - `POST /api/reports/export` — CSV / PDF (reportlab) / JSON
  - `GET|POST|DELETE /api/reports/templates` — save custom filter presets per tenant
  - Frontend `/reports` page: 5 report tiles, filter panel (aggregation, dates, plant, metric, forecast toggle + horizon), preset chips (30d / 12w / 12mo), KPI cards, composed chart with actual bars + forecast line + CI band, trend + breakdown tables, export buttons, saved templates chips
  - Audit log entries for report.run / report.export / report.template.save|delete
  - Backend regression tests: `/app/backend/tests/test_iteration7.py` (13/13 pass)

## Modules (tenant-toggled)
APM, EEMS, DIGITAL_TWIN, OEE_APS, AI_COPILOT, REPORTS (default ON), AUDIT.

## Prioritized backlog
- **P1**: Twilio SMS wiring for alarm escalation (integration_playbook_expert_v2 for Twilio)
- **P1**: Digital Twin visual module (2D/3D live representation)
- **P1**: AI Copilot module (Claude Sonnet 5 via Emergent LLM key)
- **P2**: Scheduled Reports + email delivery (Resend managed) with per-recipient list
- **P2**: Excel (.xlsx) export
- **P2**: Report template folder-sharing / recipients / cron
- **P2**: Asset Class bulk threshold presets
- **P3**: server.py refactor into /app/backend/routers/* (reports, apm, oee, eems, platform)
- **P3**: MQTT bridge to replace HTTP ingest

## Known limitations
- Reports scheduling + email is not yet wired (deferred by user for iter 7)
- Excel export uses CSV; no xlsx generator installed yet
- server.py has grown to ~2760 lines — modular refactor pending
