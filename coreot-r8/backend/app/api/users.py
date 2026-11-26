"""People who can sign in (admins only)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import shapes
from ..deps import audit, get_db, require_admin
from ..models import User
from ..security import hash_password

router = APIRouter(prefix="/api/users", tags=["people"])
ROLES = {"cxo", "mgr", "sup", "opr"}


class UserIn(BaseModel):
    username: str = Field(min_length=2, max_length=64, pattern=r"^[a-z0-9._-]+$")
    name: str = Field(min_length=1, max_length=120)
    role: str
    title: str = Field(default="", max_length=64)
    password: str = Field(min_length=8, max_length=200)
    isAdmin: bool = False


class UserPatch(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    role: str | None = None
    title: str | None = Field(default=None, max_length=64)
    password: str | None = Field(default=None, min_length=8, max_length=200)
    isAdmin: bool | None = None
    active: bool | None = None


@router.get("")
def list_users(u: User = Depends(require_admin), s: Session = Depends(get_db)):
    return [shapes.user(x) for x in s.scalars(select(User).where(User.plant_id == u.plant_id).order_by(User.id))]


@router.post("", status_code=201)
def create_user(body: UserIn, request: Request, u: User = Depends(require_admin), s: Session = Depends(get_db)):
    if body.role not in ROLES:
        raise HTTPException(422, "Role must be cxo, mgr, sup or opr")
    if s.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(409, "That username is taken")
    x = User(plant_id=u.plant_id, username=body.username, name=body.name, role=body.role, title=body.title,
             is_admin=body.isAdmin, password_hash=hash_password(body.password))
    s.add(x)
    audit(s, request, u, "Added user", f"{body.username} ({body.role})", "Settings")
    s.commit()
    return shapes.user(x)


@router.patch("/{user_id}")
def update_user(user_id: int, body: UserPatch, request: Request, u: User = Depends(require_admin), s: Session = Depends(get_db)):
    x = s.get(User, user_id)
    if not x or x.plant_id != u.plant_id:
        raise HTTPException(404, "No such user")
    if body.role is not None and body.role not in ROLES:
        raise HTTPException(422, "Role must be cxo, mgr, sup or opr")
    if x.id == u.id and (body.active is False or body.isAdmin is False):
        raise HTTPException(400, "You cannot remove your own admin access")
    for field, attr in (("name", "name"), ("role", "role"), ("title", "title"), ("isAdmin", "is_admin"), ("active", "active")):
        v = getattr(body, field)
        if v is not None:
            setattr(x, attr, v)
    if body.password:
        x.password_hash = hash_password(body.password)
    audit(s, request, u, "Changed user", x.username, "Settings")
    s.commit()
    return shapes.user(x)
