"""Database engine and session. SQLite by default; PostgreSQL via COREOT_DATABASE_URL."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def make_engine(url: str):
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("sqlite"):
        engine = create_engine(url, connect_args={"check_same_thread": False})

        @event.listens_for(engine, "connect")
        def _pragmas(conn, _record):  # WAL lets the simulator write while pages read
            cur = conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA synchronous=NORMAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

        return engine
    return create_engine(url, pool_pre_ping=True)


class Database:
    def __init__(self, url: str):
        self.engine = make_engine(url)
        self.SessionLocal = sessionmaker(self.engine, expire_on_commit=False)

    def create_all(self) -> None:
        from . import models  # noqa: F401  (registers tables)

        Base.metadata.create_all(self.engine)

    def session(self) -> Session:
        return self.SessionLocal()

    def dependency(self) -> Iterator[Session]:
        with self.SessionLocal() as s:
            yield s
