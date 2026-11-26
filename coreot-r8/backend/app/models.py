"""Tables. Every plant-owned row carries plant_id so one server can hold several plants."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


class Plant(Base):
    __tablename__ = "plants"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id"))
    username: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    # cxo | mgr | sup | opr, the four views the web app has; is_admin adds user management
    role: Mapped[str] = mapped_column(String(8))
    title: Mapped[str] = mapped_column(String(64), default="")
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    password_hash: Mapped[str] = mapped_column(String(255))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = (UniqueConstraint("plant_id", "key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id"))
    key: Mapped[str] = mapped_column(String(64))          # the web app's id, e.g. apm:cnc:0 or ems::2
    module: Mapped[str] = mapped_column(String(16))       # apm, ems, twin, ...
    category: Mapped[str] = mapped_column(String(16), default="")  # APM use case, e.g. cnc
    name: Mapped[str] = mapped_column(String(160))
    location: Mapped[str] = mapped_column(String(160), default="")
    status: Mapped[str] = mapped_column(String(32), default="")
    health_label: Mapped[str] = mapped_column(String(16), default="")


class Parameter(Base):
    __tablename__ = "parameters"
    id: Mapped[int] = mapped_column(primary_key=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id"))
    asset_key: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(120))
    unit: Mapped[str] = mapped_column(String(24), default="")
    lo: Mapped[float | None] = mapped_column(Float, nullable=True)
    hi: Mapped[float | None] = mapped_column(Float, nullable=True)
    base: Mapped[float] = mapped_column(Float)
    value: Mapped[float] = mapped_column(Float)
    decimals: Mapped[int] = mapped_column(Integer, default=0)
    as_text: Mapped[bool] = mapped_column(Boolean, default=True)  # the catalog stores "12.5" rather than 12.5
    path: Mapped[list] = mapped_column(JSON)              # where the value lives in the catalog
    in_alarm: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Reading(Base):
    __tablename__ = "readings"
    __table_args__ = (Index("ix_readings_param_ts", "parameter_id", "ts"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id"))
    parameter_id: Mapped[int] = mapped_column(ForeignKey("parameters.id"))
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    value: Mapped[float] = mapped_column(Float)


class Alarm(Base):
    __tablename__ = "alarms"
    id: Mapped[int] = mapped_column(primary_key=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id"), index=True)
    module: Mapped[str] = mapped_column(String(16))
    category: Mapped[str | None] = mapped_column(String(16), nullable=True)
    asset_name: Mapped[str] = mapped_column(String(160))
    asset_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    parameter_id: Mapped[int | None] = mapped_column(ForeignKey("parameters.id"), nullable=True)
    message: Mapped[str] = mapped_column(String(300))
    severity: Mapped[str] = mapped_column(String(16))     # Critical | Warning | Info
    state: Mapped[str] = mapped_column(String(16), default="Active")  # Active | Acknowledged | Cleared
    source: Mapped[str] = mapped_column(String(16), default="live")  # seed | live
    time_label: Mapped[str] = mapped_column(String(8))    # HH:MM, as the app shows it
    raised_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    acked_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    acked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cleared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class WorkOrder(Base):
    __tablename__ = "work_orders"
    __table_args__ = (UniqueConstraint("plant_id", "code"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id"), index=True)
    code: Mapped[str] = mapped_column(String(16))         # WO-1040
    title: Mapped[str] = mapped_column(String(200))
    asset_key: Mapped[str] = mapped_column(String(64), default="")
    asset_name: Mapped[str] = mapped_column(String(200), default="")
    module: Mapped[str] = mapped_column(String(16), default="apm")
    category: Mapped[str | None] = mapped_column(String(16), nullable=True)
    type: Mapped[str] = mapped_column(String(32), default="Preventive")
    priority: Mapped[str] = mapped_column(String(16), default="Medium")
    status: Mapped[str] = mapped_column(String(16), default="Open")  # Open | Assigned | In progress | Done
    assignee: Mapped[str] = mapped_column(String(120), default="")
    due: Mapped[str] = mapped_column(String(16), default="")   # "05 Dec", as the app shows it
    spares: Mapped[str] = mapped_column(String(300), default="-")
    created_by: Mapped[str] = mapped_column(String(120), default="system")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Record(Base):
    """Things people add in the app: registrations (assets, documents, vendors...), completed
    checklists, shift logbook lines and data entries. The app's own record is kept in `data`."""

    __tablename__ = "records"
    __table_args__ = (UniqueConstraint("plant_id", "kind", "client_id"), Index("ix_records_kind", "plant_id", "kind"))
    id: Mapped[int] = mapped_column(primary_key=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id"))
    kind: Mapped[str] = mapped_column(String(16))         # register | checklist | logbook | entry
    client_id: Mapped[str] = mapped_column(String(64))
    module: Mapped[str] = mapped_column(String(16), default="")
    data: Mapped[dict] = mapped_column(JSON)
    created_by: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class StoredFile(Base):
    __tablename__ = "files"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id"))
    name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, default=0)
    disk_name: Mapped[str] = mapped_column(String(120))
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    uploaded_by: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id"), index=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    user_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(32), default="")
    module: Mapped[str] = mapped_column(String(64), default="")
    action: Mapped[str] = mapped_column(String(120))
    obj: Mapped[str] = mapped_column(Text, default="")
    device: Mapped[str] = mapped_column(String(160), default="")


class SharedState(Base):
    """Plant-wide settings the app keeps as small objects: limits, tags, permit signatures,
    nameplates, decisions, report schedules, uploaded documents list, and so on."""

    __tablename__ = "shared_state"
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id"), primary_key=True)
    key: Mapped[str] = mapped_column(String(32), primary_key=True)
    value: Mapped[dict | list] = mapped_column(JSON)
    updated_by: Mapped[str] = mapped_column(String(120), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Preference(Base):
    """Each person's own screen settings (theme, layout, selected modules, units...)."""

    __tablename__ = "preferences"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
