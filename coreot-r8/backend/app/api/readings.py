"""Assets, live readings, reading history and CSV export."""

from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import current_user, get_db
from ..models import Asset, Parameter, Reading, User

router = APIRouter(prefix="/api", tags=["assets and readings"])


def _param(request: Request, u: User, p: Parameter) -> dict:
    live = request.app.state.live[u.plant_id].by_id.get(p.id)
    lo, hi, enabled = live.limits(request.app.state.live[u.plant_id].limits) if live else (p.lo, p.hi, True)
    return {"id": p.id, "name": p.name, "unit": p.unit, "value": round(live.value if live else p.value, max(p.decimals, 1)),
            "lo": lo, "hi": None if hi == float("inf") else hi, "alarmOn": enabled,
            "inAlarm": live.in_alarm if live else p.in_alarm, "normal": p.base}


@router.get("/assets")
def list_assets(request: Request, module: str | None = None, category: str | None = None,
                u: User = Depends(current_user), s: Session = Depends(get_db)):
    stmt = select(Asset).where(Asset.plant_id == u.plant_id)
    if module:
        stmt = stmt.where(Asset.module == module)
    if category:
        stmt = stmt.where(Asset.category == category)
    assets = s.scalars(stmt.order_by(Asset.id)).all()
    params: dict[str, list] = {}
    for p in s.scalars(select(Parameter).where(Parameter.plant_id == u.plant_id, Parameter.asset_key.in_([a.key for a in assets]))):
        params.setdefault(p.asset_key, []).append(_param(request, u, p))
    return [{"key": a.key, "module": a.module, "category": a.category, "name": a.name, "location": a.location,
             "status": a.status, "health": a.health_label, "readings": params.get(a.key, [])} for a in assets]


@router.get("/assets/{key}")
def get_asset(key: str, request: Request, u: User = Depends(current_user), s: Session = Depends(get_db)):
    a = s.scalar(select(Asset).where(Asset.plant_id == u.plant_id, Asset.key == key))
    if not a:
        raise HTTPException(404, "No such asset")
    ps = s.scalars(select(Parameter).where(Parameter.plant_id == u.plant_id, Parameter.asset_key == key).order_by(Parameter.id))
    return {"key": a.key, "module": a.module, "category": a.category, "name": a.name, "location": a.location,
            "status": a.status, "health": a.health_label, "readings": [_param(request, u, p) for p in ps]}


@router.get("/parameters/{param_id}/history")
def history(param_id: int, hours: float = Query(24, gt=0, le=24 * 90), u: User = Depends(current_user),
            s: Session = Depends(get_db)):
    p = s.get(Parameter, param_id)
    if not p or p.plant_id != u.plant_id:
        raise HTTPException(404, "No such reading")
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows = s.execute(select(Reading.ts, Reading.value).where(Reading.parameter_id == param_id, Reading.ts >= since)
                     .order_by(Reading.ts)).all()
    return {"id": p.id, "asset": p.asset_key, "name": p.name, "unit": p.unit,
            "points": [[ts.replace(tzinfo=ts.tzinfo or timezone.utc).isoformat(), v] for ts, v in rows]}


@router.get("/export/readings.csv")
def export_csv(asset: str | None = None, hours: float = Query(24, gt=0, le=24 * 90), u: User = Depends(current_user),
               s: Session = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    stmt = (select(Reading.ts, Parameter.asset_key, Parameter.name, Parameter.unit, Reading.value)
            .join(Parameter, Parameter.id == Reading.parameter_id)
            .where(Reading.plant_id == u.plant_id, Reading.ts >= since))
    if asset:
        stmt = stmt.where(Parameter.asset_key == asset)
    stmt = stmt.order_by(Reading.ts, Parameter.id)

    def rows():
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["time_utc", "asset", "reading", "unit", "value"])
        for ts, key, name, unit, value in s.execute(stmt):
            w.writerow([ts.isoformat(), key, name, unit, value])
            if buf.tell() > 64_000:
                yield buf.getvalue()
                buf.seek(0)
                buf.truncate()
        yield buf.getvalue()

    name = f"readings-{asset or 'all'}-{datetime.now():%Y%m%d-%H%M}.csv".replace(":", "_")
    return StreamingResponse(rows(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}"'})
