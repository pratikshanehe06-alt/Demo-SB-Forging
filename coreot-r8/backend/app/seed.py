"""Test data: one plant, six people, every asset and reading from the catalog, 24 hours of
reading history, the alarm list, work orders, a shift logbook and the audit trail the
prototype started with. Runs once, on an empty database."""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, insert, select
from sqlalchemy.orm import Session

from . import catalog as cat
from .config import Settings
from .models import Alarm, Asset, AuditEvent, Parameter, Plant, Reading, Record, User, WorkOrder
from .security import hash_password

PEOPLE = [
    # username, name, role, title, admin
    ("admin", "Plant Admin", "mgr", "Admin", True),
    ("nkulkarni", "N. Kulkarni", "cxo", "Plant Head", False),
    ("ajoshi", "A. Joshi", "mgr", "Manager", False),
    ("rpatil", "R. Patil", "sup", "Supervisor", False),
    ("mjadhav", "M. Jadhav", "sup", "Maintenance", False),
    ("skhan", "S. Khan", "opr", "Operator", False),
]

TRAIL = [
    ("08:02", "R. Patil", "Supervisor", "APM", "Acknowledged alarm", "Hydrant System: low pressure"),
    ("08:15", "A. Joshi", "Manager", "OEE & APS", "Re-planned schedule", "SO-2210 split across Line 1 and 2"),
    ("08:40", "S. Khan", "Operator", "OEE & APS", "Data entry", "Production count, Line 1, Shift A"),
    ("09:05", "Plant Admin", "Admin", "Settings", "Changed unit", "Pressure: bar → psi"),
    ("09:20", "M. Jadhav", "Maintenance", "APM", "Closed work order", "WO-1031 Replace jockey pump seal"),
    ("09:41", "R. Patil", "Supervisor", "Telematics", "Signed permit", "P-121 Electrical isolation, receiver"),
]

LOGBOOK = [
    ["06:05", "A", "R. Patil", "Pump house", "Handover", "Night shift: jockey pump started 4 times, seal leak small", "Open"],
    ["07:30", "A", "S. Khan", "Machine shop", "Observation", "VMC-07 noise at high speed, maintenance informed", "Open"],
    ["09:10", "A", "M. Jadhav", "Utility yard", "Issue", "Compressor 2 header leak, tagged for repair", "In progress"],
    ["10:45", "A", "A. Joshi", "Quality", "Instruction", "Extra sample check at station 2 until fixture fixed", "Done"],
]


def _today_at(label: str) -> datetime:
    """A HH:MM label from the prototype, placed on today's date (or yesterday if still ahead)."""
    h, m = (int(x) for x in label.split(":"))
    local = datetime.now().astimezone()
    t = local.replace(hour=h, minute=m, second=0, microsecond=0)
    if t > local:
        t -= timedelta(days=1)
    return t.astimezone(timezone.utc)


def seed(s: Session, settings: Settings, history_hours: int = 24) -> bool:
    if s.scalar(select(func.count(Plant.id))):
        return False
    plant = Plant(code="NSK", name=settings.plant_name)
    s.add(plant)
    s.flush()
    pid = plant.id

    pw = hash_password(settings.demo_password)
    for username, name, role, title, admin in PEOPLE:
        s.add(User(plant_id=pid, username=username, name=name, role=role, title=title, is_admin=admin, password_hash=pw))

    specs = cat.assets()
    for a in specs:
        s.add(Asset(plant_id=pid, key=a.key, module=a.module, category=a.category, name=a.name,
                    location=a.location, status=a.status, health_label=a.health_label))
    s.flush()

    params = []
    for a in specs:
        for p in a.params:
            bad = p.hi is not None and cat._range_state(p.base, p.lo, p.hi) == "bad"
            row = Parameter(plant_id=pid, asset_key=a.key, name=p.name, unit=p.unit, lo=p.lo, hi=p.hi,
                            base=p.base, value=p.base, decimals=p.decimals, as_text=p.as_text, path=p.path,
                            in_alarm=bad)
            s.add(row)
            params.append(row)
    s.flush()

    _history(s, pid, params, history_hours)

    for al in cat.seed_alarms():
        s.add(Alarm(plant_id=pid, source="seed", state="Active", raised_at=_today_at(al["time_label"]), **al))

    for wo in cat.seed_work_orders():
        s.add(WorkOrder(plant_id=pid, created_by="system", **wo))

    for i, row in enumerate(LOGBOOK):
        s.add(Record(plant_id=pid, kind="logbook", client_id=f"seed-{i + 1}", module="tele", data={"row": row},
                     created_by=row[2], created_at=_today_at(row[0])))

    for t, user, role, module, action, obj in TRAIL:
        s.add(AuditEvent(plant_id=pid, ts=_today_at(t), user_name=user, role=role, module=module, action=action,
                         obj=obj, device=f"Web · 10.20.4.{10 + cat.hs(user) % 80}"))
    s.commit()
    return True


def _history(s: Session, plant_id: int, params: list[Parameter], hours: int, step_min: int = 10) -> None:
    """A believable past: each reading wanders around its normal value."""
    if hours <= 0:
        return
    rng = random.Random(42)
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    steps = hours * 60 // step_min
    rows = []
    for p in params:
        v = p.base
        spread = abs(p.base) * 0.03 or 0.5
        for k in range(steps, 0, -1):
            v += (p.base - v) * 0.2 + rng.gauss(0, spread * 0.5)
            if p.base >= 0:
                v = max(0.0, v)
            rows.append({"plant_id": plant_id, "parameter_id": p.id, "ts": now - timedelta(minutes=k * step_min),
                         "value": round(v, max(p.decimals, 1))})
    for i in range(0, len(rows), 5000):
        s.execute(insert(Reading), rows[i:i + 5000])
