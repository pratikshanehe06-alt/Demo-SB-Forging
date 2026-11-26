"""Registrations, checklists, logbook lines, data entries, and the files attached to them."""

from __future__ import annotations

import json
import mimetypes
import re
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import shapes
from ..deps import current_user, get_db, origin, require_edit, require_lead
from ..models import Record, StoredFile, User

router = APIRouter(prefix="/api", tags=["records and files"])
KINDS = {"register", "checklist", "logbook", "entry"}
SAFE_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")


def _kind(kind: str) -> str:
    if kind not in KINDS:
        raise HTTPException(404, "Unknown record type")
    return kind


@router.get("/records/{kind}")
def list_records(kind: str, u: User = Depends(current_user), s: Session = Depends(get_db)):
    rows = s.scalars(select(Record).where(Record.plant_id == u.plant_id, Record.kind == _kind(kind))
                     .order_by(Record.created_at.desc(), Record.id.desc()))
    return [shapes.record(r) for r in rows]


@router.put("/records/{kind}/{client_id}")
async def put_record(kind: str, client_id: str, request: Request, u: User = Depends(require_edit), s: Session = Depends(get_db)):
    """Create or replace one record. The body is the app's own object (or {"row": [...]} for the logbook)."""
    _kind(kind)
    if not SAFE_ID.match(client_id):
        raise HTTPException(422, "Bad record id")
    data = await request.json()
    if not isinstance(data, dict) or len(json.dumps(data)) > 500_000:
        raise HTTPException(422, "Expected an object under 500 kB")
    data.pop("cid", None)
    module = str(data.pop("m", "") if kind == "entry" else data.get("mod", "") or "")[:16]
    if kind == "logbook":
        module = "tele"
        if not isinstance(data.get("row"), list):
            raise HTTPException(422, "A logbook line is {'row': [...]}")
    r = s.scalar(select(Record).where(Record.plant_id == u.plant_id, Record.kind == kind, Record.client_id == client_id))
    if r:
        r.data, r.module = data, module
    else:
        r = Record(plant_id=u.plant_id, kind=kind, client_id=client_id, module=module, data=data, created_by=u.name)
        s.add(r)
    s.commit()
    out = shapes.record(r)
    await request.app.state.hub.send(u.plant_id, {"type": "record", "kind": kind, "record": out, "origin": origin(request)})
    return out


@router.delete("/records/{kind}/{client_id}")
async def delete_record(kind: str, client_id: str, request: Request, u: User = Depends(require_lead), s: Session = Depends(get_db)):
    r = s.scalar(select(Record).where(Record.plant_id == u.plant_id, Record.kind == _kind(kind), Record.client_id == client_id))
    if not r:
        raise HTTPException(404, "No such record")
    s.delete(r)
    s.commit()
    await request.app.state.hub.send(u.plant_id, {"type": "record-deleted", "kind": kind, "cid": client_id, "origin": origin(request)})
    return {"ok": True}


# ---------------------------------------------------------------- files

@router.post("/files", status_code=201)
async def upload(request: Request, file: UploadFile = File(...), id: str | None = Form(None), meta: str = Form("{}"),
                 u: User = Depends(require_edit), s: Session = Depends(get_db)):
    cfg = request.app.state.settings
    fid = id if id and SAFE_ID.match(id) else uuid.uuid4().hex
    limit = cfg.max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"Files up to {cfg.max_upload_mb} MB")
    try:
        meta_obj = json.loads(meta) if meta else {}
    except ValueError:
        meta_obj = {}
    name = (file.filename or "file").replace("/", "_").replace("\\", "_")[:255]
    ctype = file.content_type or mimetypes.guess_type(name)[0] or "application/octet-stream"
    existing = s.get(StoredFile, fid)
    if existing and existing.plant_id != u.plant_id:
        fid = uuid.uuid4().hex
        existing = None
    disk = f"{u.plant_id}-{uuid.uuid4().hex}"
    (cfg.files_dir / disk).write_bytes(data)
    if existing:
        (cfg.files_dir / existing.disk_name).unlink(missing_ok=True)
        existing.name, existing.content_type, existing.size, existing.disk_name = name, ctype, len(data), disk
        existing.meta = meta_obj
        f = existing
    else:
        f = StoredFile(id=fid, plant_id=u.plant_id, name=name, content_type=ctype, size=len(data), disk_name=disk,
                       meta=meta_obj, uploaded_by=u.name)
        s.add(f)
    s.commit()
    return shapes.file(f)


def _file(s: Session, u: User, file_id: str) -> StoredFile:
    f = s.get(StoredFile, file_id)
    if not f or f.plant_id != u.plant_id:
        raise HTTPException(404, "No such file")
    return f


@router.get("/files")
def list_files(u: User = Depends(current_user), s: Session = Depends(get_db)):
    return [shapes.file(f) for f in s.scalars(select(StoredFile).where(StoredFile.plant_id == u.plant_id)
                                                 .order_by(StoredFile.created_at.desc()))]


@router.get("/files/{file_id}")
def download(file_id: str, request: Request, u: User = Depends(current_user), s: Session = Depends(get_db)):
    f = _file(s, u, file_id)
    path = request.app.state.settings.files_dir / f.disk_name
    if not path.exists():
        raise HTTPException(410, "The file is missing on the server")
    return FileResponse(path, media_type=f.content_type, filename=f.name)


@router.delete("/files/{file_id}")
def delete_file(file_id: str, request: Request, u: User = Depends(require_edit), s: Session = Depends(get_db)):
    f = _file(s, u, file_id)
    (request.app.state.settings.files_dir / f.disk_name).unlink(missing_ok=True)
    s.delete(f)
    s.commit()
    return {"ok": True}
