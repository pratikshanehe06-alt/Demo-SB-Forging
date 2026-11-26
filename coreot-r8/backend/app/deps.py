"""Request helpers: database session, signed-in user, role checks, audit."""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .models import AuditEvent, User
from .security import read_token

ROLE_TITLE = {"cxo": "CXO", "mgr": "Manager", "sup": "Supervisor", "opr": "Operator"}


def get_db(request: Request) -> Iterator[Session]:
    with request.app.state.db.session() as s:
        yield s


def user_from_token(request_or_ws, s: Session, token: str | None) -> User | None:
    if not token:
        return None
    data = read_token(request_or_ws.app.state.settings.secret_key, token)
    if not data:
        return None
    u = s.get(User, int(data["sub"]))
    if not u or not u.active:
        return None
    return u


def current_user(request: Request, s: Session = Depends(get_db)) -> User:
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else request.cookies.get("coreot_token")
    u = user_from_token(request, s, token)
    if not u:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in again", headers={"WWW-Authenticate": "Bearer"})
    return u


def can_edit(u: User) -> bool:
    """CXO accounts look at the plant; they do not change it."""
    return u.is_admin or u.role != "cxo"


def require_edit(u: User = Depends(current_user)) -> User:
    if not can_edit(u):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role can view but not change plant data")
    return u


def require_lead(u: User = Depends(current_user)) -> User:
    """Supervisors, managers and admins: move work orders, sign permits, approve."""
    if not (u.is_admin or u.role in {"mgr", "sup"}):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Needs a supervisor or manager")
    return u


def require_manager(u: User = Depends(current_user)) -> User:
    if not (u.is_admin or u.role == "mgr"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Needs a manager")
    return u


def require_admin(u: User = Depends(current_user)) -> User:
    if not u.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Needs an admin")
    return u


def origin(request: Request) -> str:
    """The browser tab that made the change; it already shows it, so live pushes skip it."""
    return request.headers.get("x-client-id", "")[:64]


def device(request: Request) -> str:
    ua = request.headers.get("user-agent", "")
    browser = next((b for b in ("Edg", "Chrome", "Firefox", "Safari") if b in ua), "Browser")
    browser = {"Edg": "Edge"}.get(browser, browser)
    host = request.client.host if request.client else "-"
    return f"Web · {browser} · {host}"


def audit(s: Session, request: Request, u: User, action: str, obj: str = "", module: str = "") -> AuditEvent:
    e = AuditEvent(plant_id=u.plant_id, user_name=u.name, role=u.title or ROLE_TITLE.get(u.role, u.role),
                   module=module, action=action, obj=obj, device=device(request))
    s.add(e)
    return e
