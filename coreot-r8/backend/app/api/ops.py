"""Alarms and work orders."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import shapes
from ..catalog import WO_STATES
from ..deps import current_user, get_db, origin, require_edit, require_lead
from ..models import Alarm, User, WorkOrder

router = APIRouter(prefix="/api", tags=["alarms and work orders"])


# ---------------------------------------------------------------- alarms

@router.get("/alarms")
def list_alarms(state: str | None = None, module: str | None = None, u: User = Depends(current_user),
                s: Session = Depends(get_db)):
    stmt = select(Alarm).where(Alarm.plant_id == u.plant_id)
    if state:
        stmt = stmt.where(Alarm.state == state)
    if module:
        stmt = stmt.where(Alarm.module == module)
    return [shapes.alarm(a) for a in s.scalars(stmt.order_by(Alarm.id))]


async def _ack(s: Session, request: Request, u: User, ids: list[int]) -> list[dict]:
    rows = s.scalars(select(Alarm).where(Alarm.plant_id == u.plant_id, Alarm.id.in_(ids))).all()
    now = datetime.now(timezone.utc)
    for a in rows:
        if a.state == "Active":
            a.state, a.acked_by, a.acked_at = "Acknowledged", u.name, now
    s.commit()
    out = [shapes.alarm(a) for a in rows]
    for a in out:
        await request.app.state.hub.send(u.plant_id, {"type": "alarm", "alarm": a, "origin": origin(request)})
    return out


@router.post("/alarms/{alarm_id}/ack")
async def ack(alarm_id: int, request: Request, u: User = Depends(require_edit), s: Session = Depends(get_db)):
    out = await _ack(s, request, u, [alarm_id])
    if not out:
        raise HTTPException(404, "No such alarm")
    return out[0]


class AckMany(BaseModel):
    ids: list[int] = Field(max_length=5000)


@router.post("/alarms/ack")
async def ack_many(body: AckMany, request: Request, u: User = Depends(require_edit), s: Session = Depends(get_db)):
    return await _ack(s, request, u, body.ids)


# ---------------------------------------------------------------- work orders

class WorkOrderIn(BaseModel):
    id: str | None = Field(default=None, max_length=16)   # the code the app proposed, e.g. WO-1146
    t: str = Field(default="Work order", max_length=200)
    aid: str = Field(default="", max_length=64)
    asset: str = Field(default="", max_length=200)
    mod: str | None = Field(default=None, max_length=16)
    cat: str | None = Field(default=None, max_length=16)
    type: str = Field(default="Corrective", max_length=32)
    pri: str = Field(default="Medium", max_length=16)
    st: str = Field(default="Assigned", max_length=16)
    who: str = Field(default="", max_length=120)
    due: str = Field(default="", max_length=16)
    spares: str = Field(default="-", max_length=300)


class WorkOrderPatch(BaseModel):
    t: str | None = Field(default=None, max_length=200)
    pri: str | None = Field(default=None, max_length=16)
    st: str | None = Field(default=None, max_length=16)
    who: str | None = Field(default=None, max_length=120)
    due: str | None = Field(default=None, max_length=16)
    spares: str | None = Field(default=None, max_length=300)
    type: str | None = Field(default=None, max_length=32)


def _next_code(s: Session, plant_id: int) -> str:
    codes = s.scalars(select(WorkOrder.code).where(WorkOrder.plant_id == plant_id)).all()
    nums = [int(m.group(1)) for c in codes if (m := re.match(r"WO-(\d+)$", c))]
    return f"WO-{max(nums + [1299]) + 1}"


@router.get("/work-orders")
def list_work_orders(status: str | None = None, asset: str | None = None, u: User = Depends(current_user),
                     s: Session = Depends(get_db)):
    stmt = select(WorkOrder).where(WorkOrder.plant_id == u.plant_id)
    if status:
        stmt = stmt.where(WorkOrder.status == status)
    if asset:
        stmt = stmt.where(WorkOrder.asset_key == asset)
    return [shapes.work_order(w) for w in s.scalars(stmt.order_by(WorkOrder.created_at.desc(), WorkOrder.id))]


@router.post("/work-orders", status_code=201)
async def create_work_order(body: WorkOrderIn, request: Request, u: User = Depends(require_edit), s: Session = Depends(get_db)):
    if body.st not in WO_STATES:
        raise HTTPException(422, f"Status must be one of {', '.join(WO_STATES)}")
    code = body.id if body.id and re.match(r"^WO-\d{1,8}$", body.id) else None
    if not code or s.scalar(select(func.count()).where(WorkOrder.plant_id == u.plant_id, WorkOrder.code == code)):
        code = _next_code(s, u.plant_id)
    module = body.mod or (body.aid.split(":")[0] if body.aid else "apm")
    w = WorkOrder(plant_id=u.plant_id, code=code, title=body.t, asset_key=body.aid, asset_name=body.asset,
                  module=module, category=body.cat if module == "apm" else None, type=body.type, priority=body.pri, status=body.st, assignee=body.who,
                  due=body.due, spares=body.spares, created_by=u.name)
    s.add(w)
    s.commit()
    out = shapes.work_order(w)
    await request.app.state.hub.send(u.plant_id, {"type": "wo", "wo": out, "origin": origin(request)})
    return out


@router.patch("/work-orders/{code}")
async def update_work_order(code: str, body: WorkOrderPatch, request: Request, u: User = Depends(require_edit),
                            s: Session = Depends(get_db)):
    w = s.scalar(select(WorkOrder).where(WorkOrder.plant_id == u.plant_id, WorkOrder.code == code))
    if not w:
        raise HTTPException(404, "No such work order")
    changes = body.model_dump(exclude_none=True)
    if "st" in changes:
        if changes["st"] not in WO_STATES:
            raise HTTPException(422, f"Status must be one of {', '.join(WO_STATES)}")
        if changes["st"] != w.status and not (u.is_admin or u.role in {"mgr", "sup"}):
            if not (u.name == w.assignee and changes["st"] in {"In progress", "Done"}):
                raise HTTPException(403, "Only a supervisor, a manager or the assigned person can move this work order")
    for k, v in changes.items():
        setattr(w, shapes.WO_FIELDS[k], v)
    s.commit()
    out = shapes.work_order(w)
    await request.app.state.hub.send(u.plant_id, {"type": "wo", "wo": out, "origin": origin(request)})
    return out


@router.delete("/work-orders/{code}")
async def delete_work_order(code: str, request: Request, u: User = Depends(require_lead), s: Session = Depends(get_db)):
    w = s.scalar(select(WorkOrder).where(WorkOrder.plant_id == u.plant_id, WorkOrder.code == code))
    if not w:
        raise HTTPException(404, "No such work order")
    s.delete(w)
    s.commit()
    await request.app.state.hub.send(u.plant_id, {"type": "wo-deleted", "id": code, "origin": origin(request)})
    return {"ok": True}
