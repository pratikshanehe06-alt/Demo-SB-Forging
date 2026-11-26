"""Passwords (argon2) and sign-in tokens (JWT)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

_hasher = PasswordHasher()
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _hasher.verify(hashed, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def make_token(secret: str, user_id: int, plant_id: int, hours: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "plant": plant_id, "iat": now, "exp": now + timedelta(hours=hours)}
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def read_token(secret: str, token: str) -> dict | None:
    try:
        return jwt.decode(token, secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
