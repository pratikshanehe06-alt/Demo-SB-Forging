"""Everything the web app needs at start, plus plant-wide settings, personal settings and
the audit trail."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import shapes
from ..deps import can_edit, current_user, get_db, origin
from ..models import Alarm, AuditEvent, Plant, Preference, Record, SharedState, StoredFile, User, WorkOrder

router = APIRouter(prefix="/api", tags=["plant"])

# Plant-wide settings kept as small objects. Value: who may change it.
#   edit: anyone except CXO view   lead: supervisor, manager, admin
SHARED_KEYS = {
    "limits": "lead",      # low/high/alarm per reading (S.klim)
    "tags": "lead",        # tag names per reading (S.ktag)
    "units": "edit",       # unit shown per reading (S.ku)
    "permits": "lead",     # permit-to-work signatures (UI.ptwSign)
    "nameplates": "edit",  # nameplate details per asset (UI.np)
    "identity": "edit",    # QR / identity details per asset (UI.ident)
    "decisions": "lead",   # AI recommendations acted on (UI.done)
    "rca": "edit",         # alarms with a submitted 5-why (UI.rca)
    "schedules": "edit",   # scheduled reports (UI.sched)
    "documents": "edit",   # uploaded documents list (UI.udocs; files themselves under /api/files)
}
AUDIT_LIMIT = 500


def _allowed(u: User, level: str) -> bool:
    if level == "lead":
        return u.is_admin or u.role in {"mgr", "sup"}
    return can_edit(u)


def shared_state(s: Session, plant_id: int) -> dict[str, Any]:
    out: dict[str, Any] = {k: ([] if k in {"schedules", "documents"} else {}) for k in SHARED_KEYS}
    for row in s.scalars(select(SharedState).where(SharedState.plant_id == plant_id)):
        out[row.key] = row.value
    return out


@router.get("/bootstrap")
def bootstrap(request: Request, u: User = Depends(current_user), s: Session = Depends(get_db)):
    pid = u.plant_id
    live = request.app.state.live[pid]
    plant = s.get(Plant, pid)
    records: dict[str, list] = {"register": [], "checklist": [], "logbook": [], "entry": []}
    for r in s.scalars(select(Record).where(Record.plant_id == pid).order_by(Record.created_at.desc(), Record.id.desc())):
        records.setdefault(r.kind, []).append(shapes.record(r))
    pref = s.get(Preference, u.id)
    return {
        "user": shapes.user(u),
        "plant": {"id": plant.id, "code": plant.code, "name": plant.name},
        "catalog": live.catalog,
        "liveIndex": live.live_index(),
        "alarms": [shapes.alarm(a) for a in s.scalars(select(Alarm).where(Alarm.plant_id == pid).order_by(Alarm.id))],
        "workOrders": [shapes.work_order(w) for w in s.scalars(
            select(WorkOrder).where(WorkOrder.plant_id == pid).order_by(WorkOrder.created_at.desc(), WorkOrder.id))],
        "records": records,
        "audit": [shapes.audit(e) for e in s.scalars(
            select(AuditEvent).where(AuditEvent.plant_id == pid).order_by(AuditEvent.ts.desc(), AuditEvent.id.desc()).limit(AUDIT_LIMIT))],
        "state": shared_state(s, pid),
        "prefs": pref.value if pref else None,
        "files": [shapes.file(f) for f in s.scalars(select(StoredFile).where(StoredFile.plant_id == pid))],
        "canEdit": can_edit(u),
    }


@router.get("/catalog")
def catalog(request: Request, u: User = Depends(current_user)):
    live = request.app.state.live[u.plant_id]
    return {"catalog": live.catalog, "liveIndex": live.live_index()}


# ---------------------------------------------------------------- shared settings

@router.get("/state")
def get_state(u: User = Depends(current_user), s: Session = Depends(get_db)):
    return shared_state(s, u.plant_id)


@router.put("/state/{key}")
async def put_state(key: str, request: Request, u: User = Depends(current_user), s: Session = Depends(get_db)):
    if key not in SHARED_KEYS:
        raise HTTPException(404, "Unknown setting")
    if not _allowed(u, SHARED_KEYS[key]):
        raise HTTPException(403, "Your role cannot change this")
    value = await request.json()
    if not isinstance(value, (dict, list)):
        raise HTTPException(422, "Expected an object or a list")
    if len(json.dumps(value)) > 2_000_000:
        raise HTTPException(413, "Too large")
    row = s.get(SharedState, (u.plant_id, key))
    if row:
        row.value, row.updated_by = value, u.name
    else:
        s.add(SharedState(plant_id=u.plant_id, key=key, value=value, updated_by=u.name))
    s.commit()
    if key == "limits":
        request.app.state.live[u.plant_id].limits = value
    await request.app.state.hub.send(u.plant_id, {"type": "state", "key": key, "value": value, "origin": origin(request)})
    return {"ok": True}


# ---------------------------------------------------------------- personal settings

@router.get("/prefs")
def get_prefs(u: User = Depends(current_user), s: Session = Depends(get_db)):
    p = s.get(Preference, u.id)
    return p.value if p else {}


@router.put("/prefs")
async def put_prefs(request: Request, u: User = Depends(current_user), s: Session = Depends(get_db)):
    value = await request.json()
    if not isinstance(value, dict):
        raise HTTPException(422, "Expected an object")
    for k in ("klim", "ktag", "ku", "page"):  # plant-wide, or not worth keeping
        value.pop(k, None)
    p = s.get(Preference, u.id)
    if p:
        p.value = value
    else:
        s.add(Preference(user_id=u.id, value=value))
    s.commit()
    return {"ok": True}


# ---------------------------------------------------------------- audit trail

class AuditIn(BaseModel):
    action: str = Field(min_length=1, max_length=120)
    obj: str = Field(default="", max_length=2000)
    mod: str = Field(default="", max_length=64)


@router.get("/audit")
def list_audit(limit: int = Query(200, le=5000), q: str = "", u: User = Depends(current_user), s: Session = Depends(get_db)):
    stmt = select(AuditEvent).where(AuditEvent.plant_id == u.plant_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(AuditEvent.action.ilike(like) | AuditEvent.obj.ilike(like) | AuditEvent.user_name.ilike(like))
    return [shapes.audit(e) for e in s.scalars(stmt.order_by(AuditEvent.ts.desc(), AuditEvent.id.desc()).limit(limit))]


@router.post("/audit")
async def add_audit(body: AuditIn, request: Request, u: User = Depends(current_user), s: Session = Depends(get_db)):
    from ..deps import audit

    e = audit(s, request, u, body.action, body.obj, body.mod)
    s.commit()
    out = shapes.audit(e)
    await request.app.state.hub.send(u.plant_id, {"type": "audit", "event": out, "origin": origin(request)})
    return out
