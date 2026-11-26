"""Rows to the shapes the web app already uses, and back."""

from __future__ import annotations

from datetime import datetime, timezone

from .models import Alarm, AuditEvent, Record, StoredFile, User, WorkOrder


def _utc(ts: datetime) -> datetime:
    """SQLite gives back naive datetimes; they were stored in UTC."""
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)


def _local(ts: datetime) -> datetime:
    return _utc(ts).astimezone()


def user(u: User) -> dict:
    return {"id": u.id, "username": u.username, "name": u.name, "role": u.role, "title": u.title,
            "isAdmin": u.is_admin, "active": u.active}


def alarm(a: Alarm) -> dict:
    return {"id": a.id, "m": a.module, "cat": a.category, "a": a.asset_name, "msg": a.message, "sev": a.severity,
            "t": a.time_label, "st": a.state, "ai": None, "aid": a.asset_key, "src": a.source,
            "by": a.acked_by, "at": _utc(a.raised_at).isoformat() if a.raised_at else None}


def work_order(w: WorkOrder) -> dict:
    return {"id": w.code, "t": w.title, "aid": w.asset_key, "asset": w.asset_name, "mod": w.module,
            "cat": w.category if w.module == "apm" else None,
            "type": w.type, "pri": w.priority, "st": w.status, "who": w.assignee, "due": w.due,
            "spares": w.spares, "by": w.created_by}


WO_FIELDS = {"t": "title", "aid": "asset_key", "asset": "asset_name", "mod": "module", "cat": "category", "type": "type",
             "pri": "priority", "st": "status", "who": "assignee", "due": "due", "spares": "spares"}


def audit(e: AuditEvent) -> dict:
    t = _local(e.ts)
    return {"id": e.id, "t": t.strftime("%H:%M:%S"), "d": t.strftime("%d %b"), "user": e.user_name, "role": e.role,
            "mod": e.module, "action": e.action, "obj": e.obj, "dev": e.device}


def record(r: Record) -> dict:
    """register → the app's registration record; checklist/entry → their row objects;
    logbook → the app's row array."""
    d = dict(r.data)
    if r.kind == "logbook":
        return {"cid": r.client_id, "row": d.get("row", [])}
    d["cid"] = r.client_id
    if r.kind == "entry":
        d["m"] = r.module
    return d


def file(f: StoredFile) -> dict:
    return {"id": f.id, "name": f.name, "type": f.content_type, "size": f.size, "meta": f.meta,
            "by": f.uploaded_by, "at": _utc(f.created_at).isoformat()}
