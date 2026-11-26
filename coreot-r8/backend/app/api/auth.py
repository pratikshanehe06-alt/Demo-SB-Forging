from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import shapes
from ..deps import audit, current_user, get_db
from ..models import Plant, User
from ..security import hash_password, make_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["sign in"])


class Login(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=200)


class PasswordChange(BaseModel):
    current: str
    new: str = Field(min_length=8, max_length=200)


@router.post("/login")
def login(body: Login, request: Request, response: Response, s: Session = Depends(get_db)):
    u = s.scalar(select(User).where(User.username == body.username.strip().lower()))
    if not u or not u.active or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Wrong username or password")
    cfg = request.app.state.settings
    token = make_token(cfg.secret_key, u.id, u.plant_id, cfg.token_hours)
    u.last_login = datetime.now(timezone.utc)
    audit(s, request, u, "Signed in", u.username, "Sign in")
    s.commit()
    response.set_cookie("coreot_token", token, httponly=True, samesite="strict", max_age=cfg.token_hours * 3600)
    plant = s.get(Plant, u.plant_id)
    return {"token": token, "user": shapes.user(u), "plant": {"id": plant.id, "code": plant.code, "name": plant.name}}


@router.post("/logout")
def logout(request: Request, response: Response, u: User = Depends(current_user), s: Session = Depends(get_db)):
    audit(s, request, u, "Signed out", u.username, "Sign in")
    s.commit()
    response.delete_cookie("coreot_token")
    return {"ok": True}


@router.get("/me")
def me(u: User = Depends(current_user)):
    return shapes.user(u)


@router.post("/password")
def change_password(body: PasswordChange, request: Request, u: User = Depends(current_user), s: Session = Depends(get_db)):
    if not verify_password(body.current, u.password_hash):
        raise HTTPException(400, "Current password is wrong")
    u = s.merge(u)
    u.password_hash = hash_password(body.new)
    audit(s, request, u, "Changed password", u.username, "Profile")
    s.commit()
    return {"ok": True}
