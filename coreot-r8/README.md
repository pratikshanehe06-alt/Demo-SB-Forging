# CoreOT R8: web app with a FastAPI backend

The CoreOT R8 Lite prototype (one HTML file) turned into a working application:

- **Same screens.** The R8 web app runs unchanged in look and behaviour.
- **Real backend.** A Python FastAPI server signs people in, stores everything in a database, and pushes live readings and alarms to every open browser.
- **Test data built in.** One plant, six people, 178 assets with 526 live readings, 24 hours of reading history, 82 alarms, 56 work orders, a shift logbook and an audit trail. Live values move every 2 seconds. Every 3 minutes one reading is pushed past its limit, so you can watch an alarm being raised, acknowledged and cleared.
- **Works offline.** Fonts, three.js and every library are inside the project, so it runs on a plant PC with no internet.

## Start it

You need Python 3.11 or newer.

**Windows:** double-click `run.bat`
**Mac / Linux:** `./run.sh`

The first start installs the Python packages, which needs internet once. Then open **http://localhost:8000**. Other PCs on the same network can open `http://<this-pc-ip>:8000`.

**With Docker:** `docker compose up -d`, then open http://localhost:8000.

**By hand:**

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt      # Windows: .venv\Scripts\pip ...
cd backend
../.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Test accounts

Every account uses the password **`CoreOT@2026`**. To use a different one, set `COREOT_DEMO_PASSWORD` before the first start.

| Username | Person | What they can do |
|---|---|---|
| `admin` | Plant Admin | Everything, plus adding and changing users (through the API, at `/docs`) |
| `nkulkarni` | N. Kulkarni, Plant Head | CXO view. Can see everything and change nothing |
| `ajoshi` | A. Joshi, Manager | Change limits and tags, sign permits, move and delete work orders |
| `rpatil` | R. Patil, Supervisor | Same as a manager |
| `mjadhav` | M. Jadhav, Maintenance | Supervisor rights |
| `skhan` | S. Khan, Operator | Acknowledge alarms, raise work orders, fill forms, checklists and logbook. Can only move work orders assigned to them |

The dashboard opens in the view for each person's role. The server enforces these rights. If someone tries something their role does not allow, the app shows why and reloads the server's copy.

## What is saved, and where

Everything lives in `data/`, next to this file. On Docker it lives in the `coreot_data` volume.

- `data/coreot.db` is the SQLite database. Set `COREOT_DATABASE_URL` to use PostgreSQL instead. Tables are created on first start, and the test data is loaded into an empty database.
- `data/files/` holds uploaded photos, documents and 3D models.
- `data/.secret_key` is the key that signs sign-ins. Keep it private.

| In the app | Saved as |
|---|---|
| Live readings, reading history (every 60 s, kept 30 days) | `parameters`, `readings` |
| Alarms: raised, acknowledged (who and when), cleared | `alarms` |
| Work orders: created, status moves, from 5-why root cause | `work_orders` |
| "+ Add" forms (asset, meter, vehicle, spare, ...) with their files | `records` (register) + `files` |
| Uploaded documents | `files` + shared setting `documents` |
| Checklists, data entries, shift logbook | `records` |
| Limits, tags and units per reading, permit signatures, nameplates, QR identity, decisions, 5-why status, scheduled reports | `shared_state`, one row per plant and setting |
| Each person's screen settings (theme, layout, modules shown) | `preferences` |
| Audit trail: every action, with the real person, role and browser | `audit_events` |

To start again with fresh test data, stop the server and delete the `data` folder.

## How it fits together

```
browser                                      server (one Python process)
───────                                      ───────────────────────────
login.html ── POST /api/auth/login ────────▶ checks password (argon2), returns a token
index.html
  js/boot.js ── GET /api/bootstrap ────────▶ catalog with live values, alarms, work orders,
                                             records, settings, audit trail
  js/app.js     the R8 app, unchanged
  js/bridge.js  every 1.5 s sends what changed ─▶ REST API ─▶ database
                WebSocket /ws ◀──────────────── simulator: new values every 2 s, alarms,
                                                other people's changes
```

The R8 app keeps its data in plain JavaScript objects. `bridge.js` fills those objects from the server before the first screen is drawn. It then compares them with what the server last confirmed and sends only the differences. So `app.js` did not have to be rewritten, and a newer prototype can be dropped in (see below). If the server cannot be reached, a bar says so and the changes are sent when it is back.

### Folders

```
backend/
  app/main.py          server start-up, WebSocket, serves the web app
  app/api/             auth, plant (bootstrap, settings, prefs, audit), ops (alarms, work orders),
                       records (forms, checklists, logbook, files), readings (assets, history, CSV), users
  app/simulator.py     live test data and alarm rules (replace with a real feed)
  app/catalog.py       the plant catalog, asset ids, seed alarms and work orders
  app/seed.py          test people, history, logbook, audit trail
  app/models.py        database tables
  app/seed/catalog.json  assets, readings, icons, use cases (taken from the prototype)
  tests/               29 API and simulator tests (pytest)
frontend/
  index.html, login.html, js/boot.js, js/bridge.js, css/server.css   written for the server
  js/app.js, css/app.css, vendor/jsqr.js, vendor/html-to-image.js     taken from the prototype
  vendor/three/, vendor/fonts/                                        local copies, no CDN
tools/extract_r8.py    splits a prototype HTML file into the pieces above
tests-e2e/e2e.js       browser test of the whole flow (Playwright)
```

## API

Interactive documentation is at **http://localhost:8000/docs** while the server runs. The main calls are listed below. All of them need `Authorization: Bearer <token>` from `/api/auth/login`.

| Call | What it does |
|---|---|
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/password` | Sign in and sign out |
| `GET /api/bootstrap` | Everything the app needs at start |
| `GET /api/assets?module=&category=`, `GET /api/assets/{key}` | Assets with live readings and limits |
| `GET /api/parameters/{id}/history?hours=24` | Reading history |
| `GET /api/export/readings.csv?asset=&hours=` | History as CSV |
| `GET /api/alarms?state=&module=`, `POST /api/alarms/{id}/ack`, `POST /api/alarms/ack` | Alarms |
| `GET/POST /api/work-orders`, `PATCH/DELETE /api/work-orders/{code}` | Work orders |
| `GET /api/records/{kind}`, `PUT/DELETE /api/records/{kind}/{id}` | Forms, checklists, entries, logbook (kind: register, checklist, entry, logbook) |
| `POST /api/files`, `GET/DELETE /api/files/{id}` | Uploaded files |
| `GET /api/state`, `PUT /api/state/{key}` | Plant-wide settings (limits, tags, units, permits, ...) |
| `GET/PUT /api/prefs` | The signed-in person's screen settings |
| `GET/POST /api/audit` | Audit trail |
| `GET/POST /api/users`, `PATCH /api/users/{id}` | People (admins only) |
| `WS /ws` | Live push: `readings`, `alarm`, `wo`, `record`, `state`, `audit` |

## Connecting real plant data

`app/simulator.py` is the only part that invents data. For a real plant:

1. Keep the asset ids and reading names from `app/seed/catalog.json`, or add your own assets there.
2. Write the incoming value to each reading's `LiveParam.value`. The source can be an MQTT subscriber, an OPC UA client, or the mbEDGE gateway's HTTP push.
3. Call `apply()` and `check_alarms()` as `simulator.run()` does, and set `COREOT_SIMULATOR=false`.

Alarm rules, history, the WebSocket push and the app stay the same.

## Updating to a newer prototype

```bash
python tools/extract_r8.py path/to/CoreOT_R8_WebApp_Lite.html
```

This rewrites `frontend/js/app.js`, the CSS, the two inline libraries, `index.html` and `backend/app/seed/catalog.json`. It changes the app code in only four marked places:

1. The data comes from the server.
2. The bridge starts the app.
3. The signed-in person replaces the fixed "Plant Admin".
4. "+ Add" forms are stored instead of "captured".

It stops with a message if any of those places has moved. If the new prototype adds assets, delete `data/` (or add them by hand) so the database picks them up.

## Tests

```bash
.venv/bin/pip install -r backend/requirements-dev.txt
cd backend && ../.venv/bin/python -m pytest -q          # 29 tests, about 10 s
```

The browser test (`tests-e2e/e2e.js`) runs the whole flow in Chromium. It covers:

- signing in and live values arriving;
- clicking Acknowledge;
- creating and moving a work order;
- changing a limit;
- an asset form with a photo;
- uploading and downloading a document;
- a data entry;
- the audit trail;
- reloading the page;
- a second person (an operator) being refused a limit change and receiving changes live;
- a live alarm arriving;
- signing out.

The steps to run it are at the top of the file.

## Still demo content

These parts are still computed in the browser, as in the prototype:

- the KPI tiles, charts and forecasts;
- the AI Co-Pilot answers;
- the telematics map and its trips;
- report contents, and the extra readings the app adds to fill the Live data tables.

They look live but are not stored. Each one can move to the server the same way the readings did, by giving the app real numbers in the catalog or through a new API call.

The asset readings, alarms, work orders, forms, files, checklists, logbook, data entries, settings, limits and audit trail are real and stored.

## Settings

See `backend/.env.example`. Copy it to `backend/.env` to change:

- the database;
- the test password;
- how often values update;
- how often test alarms happen;
- how long history is kept;
- the upload size limit.

For a server others will use:

- set `COREOT_SECRET_KEY`;
- use HTTPS (through a reverse proxy such as nginx or Caddy);
- change the test passwords (`POST /api/auth/password`, or `PATCH /api/users/{id}` as admin).
