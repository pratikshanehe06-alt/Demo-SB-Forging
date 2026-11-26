"""CoreOT R8 server: the web app, its API, and the live data feed.

    uvicorn app.main:app --host 0.0.0.0 --port 8000      (from the backend folder)
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text

from . import simulator
from .api import auth, ops, plant, readings, records, users
from .config import Settings, settings as default_settings
from .db import Database
from .deps import user_from_token
from .hub import Hub
from .models import Plant, SharedState
from .seed import seed

log = logging.getLogger("coreot")
VERSION = "1.0.0"


def create_app(cfg: Settings | None = None, *, run_simulator: bool | None = None, history_hours: int = 24) -> FastAPI:
    cfg = cfg or default_settings
    sim_on = cfg.simulator if run_simulator is None else run_simulator

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db = Database(cfg.database_url)
        db.create_all()
        with db.session() as s:
            if seed(s, cfg, history_hours=history_hours):
                log.info("Loaded test data into an empty database")
            live = {}
            for p in s.scalars(select(Plant)):
                live[p.id] = simulator.PlantLive(p.id, s)
                row = s.get(SharedState, (p.id, "limits"))
                live[p.id].limits = row.value if row else {}
        app.state.db, app.state.live, app.state.settings, app.state.hub = db, live, cfg, Hub()
        task = asyncio.create_task(simulator.run(app)) if sim_on else None
        yield
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        with db.session() as s:
            for lv in live.values():
                lv.flush(s)
        db.engine.dispose()

    app = FastAPI(title="CoreOT R8 API", version=VERSION, lifespan=lifespan,
                  description="Backend for the CoreOT R8 web app: sign-in, live readings, alarms, work orders, "
                              "registrations, files, settings and audit trail.")
    for r in (auth.router, plant.router, ops.router, records.router, readings.router, users.router):
        app.include_router(r)

    @app.get("/api/health", tags=["server"])
    def health():
        with app.state.db.session() as s:
            s.execute(text("select 1"))
        return {"ok": True, "version": VERSION, "simulator": sim_on, "browsers": app.state.hub.count()}

    @app.websocket("/ws")
    async def ws(websocket: WebSocket):
        token = websocket.query_params.get("token") or websocket.cookies.get("coreot_token")
        with app.state.db.session() as s:
            u = user_from_token(websocket, s, token)
        if not u:
            await websocket.close(code=4401)
            return
        await websocket.accept()
        app.state.hub.add(u.plant_id, websocket)
        try:
            while True:
                if await websocket.receive_text() == "ping":
                    await websocket.send_text('{"type":"pong"}')
        except WebSocketDisconnect:
            pass
        finally:
            app.state.hub.remove(u.plant_id, websocket)

    # ---------------------------------------------------------------- web app
    front = cfg.frontend_dir
    if front.exists():
        @app.get("/", include_in_schema=False)
        def index():
            return FileResponse(front / "index.html", headers={"Cache-Control": "no-cache"})

        @app.get("/login", include_in_schema=False)
        def login_page():
            return FileResponse(front / "login.html", headers={"Cache-Control": "no-cache"})

        app.mount("/", StaticFiles(directory=front), name="web")
    else:
        @app.get("/", include_in_schema=False)
        def no_front():
            return RedirectResponse("/docs")

    @app.exception_handler(404)
    async def not_found(request, exc):
        detail = getattr(exc, "detail", "Not found")
        return JSONResponse({"detail": detail}, status_code=404)

    return app


app = create_app()
