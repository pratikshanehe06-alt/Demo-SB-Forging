"""CoreOT Platform Suite - APM Module Backend

FastAPI + MongoDB backend providing:
- JWT authentication (tenant + email + password)
- Multi-tenant Assets / Alarms / Plants / Areas
- Live telemetry ingestion (Node-RED / HTTP)
- WebSocket broadcast of telemetry to connected React clients
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import secrets
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any, Dict, List, Optional

import jwt
from dotenv import load_dotenv
from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("coreot")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "coreot-dev-secret-change-me")
JWT_ALG = "HS256"
JWT_EXPIRES_MIN = 60 * 24 * 7  # 7 days

ESCALATION_MINUTES = int(os.environ.get("ESCALATION_MINUTES", "5"))


def ensure_ingest_key() -> str:
    """Guarantee an INGEST_KEY exists; auto-generate + persist to backend/.env if missing."""
    existing = os.environ.get("INGEST_KEY", "").strip()
    if existing:
        return existing
    key = secrets.token_hex(24)
    env_path = ROOT_DIR / ".env"
    try:
        content = env_path.read_text() if env_path.exists() else ""
        if "INGEST_KEY=" not in content:
            if content and not content.endswith("\n"):
                content += "\n"
            content += f'INGEST_KEY="{key}"\n'
            env_path.write_text(content)
    except Exception as exc:
        logger.warning("Could not persist INGEST_KEY to .env: %s", exc)
    os.environ["INGEST_KEY"] = key
    logger.info("Generated CoreOT INGEST_KEY (add to Node-RED X-Ingest-Key header): %s", key)
    return key

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class Tenant(BaseModel):
    id: str
    code: str
    name: str


class User(BaseModel):
    id: str
    tenant_id: str
    email: EmailStr
    name: str
    role: str  # TENANT_ADMIN | CXO | PRODUCTION_MANAGER | SUPERVISOR | OPERATOR
    employee_id: Optional[str] = None
    plants: List[str] = []
    active: bool = True
    assigned_asset_id: Optional[str] = None


class LoginRequest(BaseModel):
    tenant_code: str
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User
    tenant: Tenant


class Plant(BaseModel):
    id: str
    tenant_id: str
    name: str
    code: str
    location: str


class Area(BaseModel):
    id: str
    tenant_id: str
    plant_id: str
    name: str


class Asset(BaseModel):
    id: str
    tenant_id: str
    plant_id: str
    area_id: str
    asset_code: str
    name: str
    asset_type: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial: Optional[str] = None
    criticality: str = "MEDIUM"
    status: str = "OFFLINE"  # RUNNING | STOPPED | IDLE | WARNING | FAULT | CRITICAL | OFFLINE
    health: int = 100
    installation_date: Optional[str] = None
    last_seen: Optional[str] = None


class AssetCreate(BaseModel):
    asset_code: str
    name: str
    asset_type: str
    plant_id: str
    area_id: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial: Optional[str] = None
    criticality: str = "MEDIUM"
    status: str = "OFFLINE"
    health: int = 100


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    asset_type: Optional[str] = None
    plant_id: Optional[str] = None
    area_id: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial: Optional[str] = None
    criticality: Optional[str] = None
    status: Optional[str] = None
    health: Optional[int] = None


class Alarm(BaseModel):
    id: str
    tenant_id: str
    asset_id: str
    asset_code: str
    severity: str  # CRITICAL | MAJOR | MINOR | INFO
    message: str
    acknowledged: bool = False
    created_at: str


class TelemetryIn(BaseModel):
    """Ingested from Node-RED / OT layer.

    Accepts either asset_id (UUID) or asset_code (e.g. CNC-DEMO-01)."""

    asset_id: Optional[str] = None
    asset_code: Optional[str] = None
    machine_status: Optional[str] = None  # RUNNING | STOPPED | IDLE | FAULT
    temperature: Optional[float] = None
    vibration: Optional[float] = None
    pressure: Optional[float] = None
    rpm: Optional[float] = None
    voltage: Optional[float] = None
    current: Optional[float] = None
    power: Optional[float] = None
    energy: Optional[float] = None
    production_count: Optional[int] = None
    good_count: Optional[int] = None
    reject_count: Optional[int] = None
    alarm: Optional[bool] = None
    alarm_message: Optional[str] = None
    timestamp: Optional[str] = None


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------


def hash_password(p: str) -> str:
    return pwd_context.hash(p)


def verify_password(p: str, hashed: str) -> bool:
    return pwd_context.verify(p, hashed)


def create_token(user_id: str, tenant_id: str) -> str:
    payload = {
        "sub": user_id,
        "tid": tenant_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRES_MIN),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(token: Annotated[Optional[str], Depends(oauth2)]) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = payload.get("sub")
    doc = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not doc:
        raise HTTPException(status_code=401, detail="User not found")
    return User(**doc)


# ---------------------------------------------------------------------------
# WebSocket manager
# ---------------------------------------------------------------------------


class WSManager:
    def __init__(self) -> None:
        self.tenant_conns: Dict[str, List[WebSocket]] = {}

    async def connect(self, ws: WebSocket, tenant_id: str) -> None:
        await ws.accept()
        self.tenant_conns.setdefault(tenant_id, []).append(ws)

    def disconnect(self, ws: WebSocket, tenant_id: str) -> None:
        if tenant_id in self.tenant_conns and ws in self.tenant_conns[tenant_id]:
            self.tenant_conns[tenant_id].remove(ws)

    async def broadcast(self, tenant_id: str, message: Dict[str, Any]) -> None:
        conns = list(self.tenant_conns.get(tenant_id, []))
        for c in conns:
            try:
                await c.send_json(message)
            except Exception:
                self.disconnect(c, tenant_id)


ws_manager = WSManager()


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------

TENANTS_SEED = [
    {"code": "SBF", "name": "SB Forgtech Pvt Ltd"},
    {"code": "ABC", "name": "ABC Manufacturing Pvt Ltd"},
]

USERS_SEED = [
    {
        "email": "tenantadmin@sbforgtech.com",
        "name": "Rajesh Kumar",
        "role": "TENANT_ADMIN",
        "password": "Admin@123",
        "tenant_code": "SBF",
        "employee_id": "EMP-001",
    },
    {
        "email": "cxo@sbforgtech.com",
        "name": "Anita Deshpande",
        "role": "CXO",
        "password": "Cxo@123",
        "tenant_code": "SBF",
        "employee_id": "EMP-002",
    },
    {
        "email": "production@sbforgtech.com",
        "name": "Vikas Shah",
        "role": "PRODUCTION_MANAGER",
        "password": "Prod@123",
        "tenant_code": "SBF",
        "employee_id": "EMP-003",
    },
    {
        "email": "supervisor@sbforgtech.com",
        "name": "Priya Menon",
        "role": "SUPERVISOR",
        "password": "Super@123",
        "tenant_code": "SBF",
        "employee_id": "EMP-004",
    },
    {
        "email": "operator@sbforgtech.com",
        "name": "Suresh Patil",
        "role": "OPERATOR",
        "password": "Operator@123",
        "tenant_code": "SBF",
        "employee_id": "EMP-005",
    },
]

AREAS_SEED = ["Forging Area", "Heat Treatment", "Utilities", "Storage"]

ASSET_TYPES = {
    "Forging Area": ["Hydraulic Press", "Forging Hammer", "CNC Machine"],
    "Heat Treatment": ["Induction Furnace", "Quench Tank", "Tempering Oven"],
    "Utilities": ["Air Compressor", "Water Chiller", "Cooling Tower"],
    "Storage": ["Overhead Crane", "Conveyor"],
}

STATUS_POOL = ["RUNNING"] * 6 + ["IDLE"] * 2 + ["FAULT"] + ["OFFLINE"]


async def seed_database() -> None:
    if await db.tenants.count_documents({}) > 0:
        logger.info("Database already seeded, skipping.")
        return

    logger.info("Seeding CoreOT demo data...")

    tenants_by_code: Dict[str, str] = {}
    for t in TENANTS_SEED:
        tid = str(uuid.uuid4())
        tenants_by_code[t["code"]] = tid
        await db.tenants.insert_one({"id": tid, "code": t["code"], "name": t["name"]})

    # Users
    for u in USERS_SEED:
        await db.users.insert_one(
            {
                "id": str(uuid.uuid4()),
                "tenant_id": tenants_by_code[u["tenant_code"]],
                "email": u["email"],
                "name": u["name"],
                "role": u["role"],
                "employee_id": u["employee_id"],
                "plants": [],
                "active": True,
                "password": hash_password(u["password"]),
            }
        )

    sbf = tenants_by_code["SBF"]

    # Plant + areas
    plant_id = str(uuid.uuid4())
    await db.plants.insert_one(
        {
            "id": plant_id,
            "tenant_id": sbf,
            "name": "Pune Plant",
            "code": "PUN-01",
            "location": "Pune, MH",
        }
    )

    # Additional plants for CXO Comparison Board
    other_plants: List[Dict[str, Any]] = []
    for pname, pcode, ploc in [
        ("Mumbai Plant", "MUM-01", "Mumbai, MH"),
        ("Nashik Plant", "NSK-01", "Nashik, MH"),
    ]:
        pid = str(uuid.uuid4())
        await db.plants.insert_one(
            {"id": pid, "tenant_id": sbf, "name": pname, "code": pcode, "location": ploc}
        )
        # one flagship area per plant
        aid = str(uuid.uuid4())
        await db.areas.insert_one(
            {"id": aid, "tenant_id": sbf, "plant_id": pid, "name": "Main Line"}
        )
        # seed a small asset pool for comparison KPIs
        for i in range(8):
            atype = random.choice(["Hydraulic Press", "Induction Furnace", "Air Compressor", "Water Chiller"])
            st = random.choice(STATUS_POOL)
            health_map = {"RUNNING": (75, 99), "IDLE": (60, 90), "FAULT": (30, 55), "OFFLINE": (0, 40)}
            low, high = health_map.get(st, (50, 90))
            await db.assets.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "tenant_id": sbf,
                    "plant_id": pid,
                    "area_id": aid,
                    "asset_code": f"{pcode}-{atype.split()[0][:3].upper()}-{i+1:02d}",
                    "name": f"{atype} {i+1}",
                    "asset_type": atype,
                    "manufacturer": random.choice(["Siemens", "ABB", "Bosch"]),
                    "model": f"M-{random.randint(100,999)}",
                    "serial": f"SN-{random.randint(10000,99999)}",
                    "criticality": random.choice(["LOW", "MEDIUM", "HIGH"]),
                    "status": st,
                    "health": random.randint(low, high),
                    "installation_date": f"20{random.randint(19,23)}-06-01",
                    "last_seen": datetime.now(timezone.utc).isoformat(),
                }
            )
        other_plants.append({"id": pid, "name": pname})

    area_ids: Dict[str, str] = {}
    for a in AREAS_SEED:
        aid = str(uuid.uuid4())
        area_ids[a] = aid
        await db.areas.insert_one({"id": aid, "tenant_id": sbf, "plant_id": plant_id, "name": a})

    # Demo CNC anchor asset
    cnc_demo_id = str(uuid.uuid4())
    await db.assets.insert_one(
        {
            "id": cnc_demo_id,
            "tenant_id": sbf,
            "plant_id": plant_id,
            "area_id": area_ids["Forging Area"],
            "asset_code": "CNC-DEMO-01",
            "name": "CNC Demo Machine",
            "asset_type": "CNC Machine",
            "manufacturer": "Siemens",
            "model": "S840D",
            "serial": "SN-DEMO-001",
            "criticality": "HIGH",
            "status": "RUNNING",
            "health": 91,
            "installation_date": "2022-04-10",
            "last_seen": datetime.now(timezone.utc).isoformat(),
        }
    )

    # Assign the CNC demo asset to the operator user for the Operator Runbook page
    await db.users.update_one(
        {"email": "operator@sbforgtech.com"},
        {"$set": {"assigned_asset_id": cnc_demo_id}},
    )

    # Generate remaining assets to reach ~45 total
    counter = {"Hydraulic Press": 0, "Forging Hammer": 0, "CNC Machine": 1, "Induction Furnace": 0,
               "Quench Tank": 0, "Tempering Oven": 0, "Air Compressor": 0, "Water Chiller": 0,
               "Cooling Tower": 0, "Overhead Crane": 0, "Conveyor": 0}

    async def add_asset(area: str, atype: str, status_hint: Optional[str] = None, health_hint: Optional[int] = None):
        counter[atype] += 1
        code_prefix_map = {
            "Hydraulic Press": "Press",
            "Forging Hammer": "Hammer",
            "CNC Machine": "CNC",
            "Induction Furnace": "Furnace",
            "Quench Tank": "Quench",
            "Tempering Oven": "Oven",
            "Air Compressor": "Compressor",
            "Water Chiller": "Chiller",
            "Cooling Tower": "Tower",
            "Overhead Crane": "Crane",
            "Conveyor": "Conveyor",
        }
        code = f"{code_prefix_map[atype]}-{counter[atype]:02d}"
        st = status_hint or random.choice(STATUS_POOL)
        health_map = {"RUNNING": (75, 99), "IDLE": (60, 90), "FAULT": (30, 55), "OFFLINE": (0, 40)}
        low, high = health_map.get(st, (50, 90))
        h = health_hint if health_hint is not None else random.randint(low, high)
        await db.assets.insert_one(
            {
                "id": str(uuid.uuid4()),
                "tenant_id": sbf,
                "plant_id": plant_id,
                "area_id": area_ids[area],
                "asset_code": code,
                "name": code,
                "asset_type": atype,
                "manufacturer": random.choice(["Siemens", "ABB", "Bosch", "Kirloskar", "L&T"]),
                "model": f"M-{random.randint(100,999)}",
                "serial": f"SN-{random.randint(10000,99999)}",
                "criticality": random.choice(["LOW", "MEDIUM", "HIGH"]),
                "status": st,
                "health": h,
                "installation_date": f"20{random.randint(18,23)}-0{random.randint(1,9)}-15",
                "last_seen": datetime.now(timezone.utc).isoformat(),
            }
        )

    # Match screenshot's hero assets
    await add_asset("Forging Area", "Hydraulic Press", "RUNNING", 98)
    await add_asset("Forging Area", "Hydraulic Press", "FAULT", 45)
    await add_asset("Heat Treatment", "Induction Furnace", "RUNNING", 70)
    await add_asset("Heat Treatment", "Induction Furnace", "IDLE", 68)
    await add_asset("Utilities", "Air Compressor", "RUNNING", 82)
    await add_asset("Utilities", "Water Chiller", "RUNNING", 80)

    # Fill to 45
    plan = [
        ("Forging Area", 12),
        ("Heat Treatment", 8),
        ("Utilities", 10),
        ("Storage", 8),
    ]
    for area, n in plan:
        for _ in range(n):
            atype = random.choice(ASSET_TYPES[area])
            await add_asset(area, atype)

    # Alarms
    all_assets = await db.assets.find({"tenant_id": sbf}, {"_id": 0}).to_list(500)
    alarm_msgs = [
        ("CRITICAL", "Hydraulic Pressure High"),
        ("CRITICAL", "Temperature Critical"),
        ("MAJOR", "Vibration High"),
        ("MAJOR", "Temperature High"),
        ("MINOR", "Coolant Flow Low"),
        ("MINOR", "Power Factor Drop"),
        ("MAJOR", "RPM Deviation"),
        ("MINOR", "Filter Clogged"),
        ("CRITICAL", "Bearing Overheat"),
        ("MAJOR", "Oil Pressure Drop"),
        ("MINOR", "Air Leak Detected"),
        ("MAJOR", "Motor Overload"),
    ]
    faulty_assets = [a for a in all_assets if a["status"] in ("FAULT", "IDLE")] or all_assets
    now = datetime.now(timezone.utc)
    for i, (sev, msg) in enumerate(alarm_msgs):
        a = random.choice(faulty_assets)
        await db.alarms.insert_one(
            {
                "id": str(uuid.uuid4()),
                "tenant_id": sbf,
                "asset_id": a["id"],
                "asset_code": a["asset_code"],
                "severity": sev,
                "message": msg,
                "acknowledged": False,
                "created_at": (now - timedelta(minutes=15 * i)).isoformat(),
            }
        )

    logger.info("Seed complete.")


# ---------------------------------------------------------------------------
# Live telemetry simulator (for CNC-DEMO-01)
# ---------------------------------------------------------------------------


async def telemetry_simulator() -> None:
    """Nudges CNC-DEMO-01 telemetry so the UI feels alive even without Node-RED.

    Real Node-RED / MQTT bridge overrides these values via POST /api/telemetry/ingest.
    """
    await asyncio.sleep(5)
    while True:
        try:
            cnc = await db.assets.find_one({"asset_code": "CNC-DEMO-01"}, {"_id": 0})
            if cnc:
                last = await db.telemetry.find_one(
                    {"asset_id": cnc["id"]}, {"_id": 0}, sort=[("ts", -1)]
                )
                base = last or {
                    "temperature": 62.0,
                    "vibration": 2.5,
                    "pressure": 5.4,
                    "rpm": 1450,
                    "voltage": 415,
                    "current": 12.4,
                    "power": 8.7,
                    "energy": 126.8,
                    "production_count": 640,
                    "good_count": 625,
                    "reject_count": 15,
                    "machine_status": cnc.get("status", "RUNNING"),
                }
                if base.get("machine_status", "RUNNING") == "RUNNING":
                    temp = float(base.get("temperature", 62)) + random.uniform(-0.4, 0.6)
                    vib = max(0.1, float(base.get("vibration", 2.5)) + random.uniform(-0.2, 0.3))
                    rpm = max(1200, min(1600, float(base.get("rpm", 1450)) + random.uniform(-20, 20)))
                    power = max(6.0, float(base.get("power", 8.7)) + random.uniform(-0.4, 0.4))
                    energy = float(base.get("energy", 126.8)) + power / 3600 * 5
                    prod = int(base.get("production_count", 640)) + random.choice([0, 0, 1])
                    good = int(base.get("good_count", 625)) + (1 if prod > int(base.get("production_count", 640)) and random.random() > 0.05 else 0)
                    rej = int(prod) - good
                    payload = TelemetryIn(
                        asset_code="CNC-DEMO-01",
                        machine_status="RUNNING",
                        temperature=round(temp, 2),
                        vibration=round(vib, 2),
                        pressure=round(float(base.get("pressure", 5.4)) + random.uniform(-0.1, 0.1), 2),
                        rpm=round(rpm, 0),
                        voltage=round(415 + random.uniform(-2, 2), 1),
                        current=round(float(base.get("current", 12.4)) + random.uniform(-0.3, 0.3), 2),
                        power=round(power, 2),
                        energy=round(energy, 2),
                        production_count=prod,
                        good_count=good,
                        reject_count=rej,
                    )
                    await ingest_telemetry_internal(payload)
        except Exception as exc:
            logger.warning("Simulator tick failed: %s", exc)
        await asyncio.sleep(5)


async def ingest_telemetry_internal(payload: TelemetryIn) -> Dict[str, Any]:
    query: Dict[str, Any] = {}
    if payload.asset_id:
        query["id"] = payload.asset_id
    elif payload.asset_code:
        query["asset_code"] = payload.asset_code
    else:
        raise HTTPException(status_code=400, detail="asset_id or asset_code required")

    asset = await db.assets.find_one(query, {"_id": 0})
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    ts = payload.timestamp or datetime.now(timezone.utc).isoformat()
    doc = payload.model_dump(exclude_none=True)
    doc.update({"asset_id": asset["id"], "asset_code": asset["asset_code"], "ts": ts,
                "tenant_id": asset["tenant_id"]})
    await db.telemetry.insert_one(doc)

    # Derive status from telemetry + explicit override
    new_status = asset.get("status", "OFFLINE")
    if payload.machine_status:
        m = payload.machine_status.upper()
        mapping = {"RUNNING": "RUNNING", "STOPPED": "STOPPED", "IDLE": "IDLE", "FAULT": "FAULT",
                   "OFF": "OFFLINE", "ON": "RUNNING"}
        new_status = mapping.get(m, m)
    if payload.temperature is not None:
        if payload.temperature > 100:
            new_status = "CRITICAL"
        elif payload.temperature > 85 and new_status in ("RUNNING", "IDLE"):
            new_status = "WARNING"
    if payload.alarm:
        new_status = "FAULT"

    health = asset.get("health", 100)
    if payload.temperature is not None:
        if payload.temperature > 100:
            health = min(health, 40)
        elif payload.temperature > 85:
            health = min(health, 65)

    await db.assets.update_one(
        {"id": asset["id"]},
        {"$set": {"status": new_status, "health": health, "last_seen": ts}},
    )

    if payload.alarm and payload.alarm_message:
        await db.alarms.insert_one(
            {
                "id": str(uuid.uuid4()),
                "tenant_id": asset["tenant_id"],
                "asset_id": asset["id"],
                "asset_code": asset["asset_code"],
                "severity": "CRITICAL",
                "message": payload.alarm_message,
                "acknowledged": False,
                "created_at": ts,
            }
        )

    broadcast = {"type": "telemetry", "asset_id": asset["id"], "asset_code": asset["asset_code"],
                 "status": new_status, "health": health, "data": {k: v for k, v in doc.items() if k != "_id"}}
    await ws_manager.broadcast(asset["tenant_id"], broadcast)
    return {"ok": True, "asset_id": asset["id"], "status": new_status, "health": health}


async def escalation_scanner() -> None:
    """Every 30s, escalate CRITICAL alarms unacknowledged for > ESCALATION_MINUTES.

    Log-only escalation for now: create an entry in `escalations`, mark alarm as
    escalated, broadcast a WS event so the UI can flag it. Swap the notifier for
    Twilio/Telegram/Slack later without touching this scanner.
    """
    await asyncio.sleep(10)
    while True:
        try:
            cutoff = (datetime.now(timezone.utc) - timedelta(minutes=ESCALATION_MINUTES)).isoformat()
            cursor = db.alarms.find(
                {
                    "severity": "CRITICAL",
                    "acknowledged": False,
                    "escalated": {"$ne": True},
                    "created_at": {"$lte": cutoff},
                },
                {"_id": 0},
            )
            async for alarm in cursor:
                now = datetime.now(timezone.utc).isoformat()
                await db.alarms.update_one(
                    {"id": alarm["id"]},
                    {"$set": {"escalated": True, "escalated_at": now}},
                )
                event = {
                    "id": str(uuid.uuid4()),
                    "tenant_id": alarm["tenant_id"],
                    "alarm_id": alarm["id"],
                    "asset_id": alarm["asset_id"],
                    "asset_code": alarm["asset_code"],
                    "severity": alarm["severity"],
                    "message": alarm["message"],
                    "channel": "log",
                    "recipient": "on-call",
                    "status": "logged",
                    "escalated_at": now,
                }
                await db.escalations.insert_one(event.copy())
                logger.warning(
                    "ESCALATION [%s] alarm=%s asset=%s msg=%s (unacked >%dmin)",
                    alarm["tenant_id"], alarm["id"], alarm["asset_code"], alarm["message"], ESCALATION_MINUTES,
                )
                event.pop("_id", None)
                await ws_manager.broadcast(alarm["tenant_id"], {"type": "escalation", "event": event})
        except Exception as exc:
            logger.warning("Escalation scanner tick failed: %s", exc)
        await asyncio.sleep(30)


# ---------------------------------------------------------------------------
# App lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_ingest_key()
    await seed_database()
    # Ensure indexes
    await db.telemetry.create_index([("asset_id", 1), ("ts", -1)])
    await db.alarms.create_index([("tenant_id", 1), ("created_at", -1)])
    await db.assets.create_index([("tenant_id", 1)])
    await db.escalations.create_index([("tenant_id", 1), ("escalated_at", -1)])
    tasks = [
        asyncio.create_task(telemetry_simulator()),
        asyncio.create_task(escalation_scanner()),
    ]
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()
        client.close()


app = FastAPI(title="CoreOT APM API", lifespan=lifespan)
api = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------


@api.post("/auth/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    tenant = await db.tenants.find_one({"code": req.tenant_code.upper()}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=401, detail="Invalid tenant / credentials")
    user_doc = await db.users.find_one({"email": req.email.lower(), "tenant_id": tenant["id"]})
    if not user_doc or not verify_password(req.password, user_doc["password"]):
        raise HTTPException(status_code=401, detail="Invalid tenant / credentials")
    if not user_doc.get("active", True):
        raise HTTPException(status_code=403, detail="Account disabled")
    token = create_token(user_doc["id"], tenant["id"])
    user_doc.pop("password", None)
    user_doc.pop("_id", None)
    return LoginResponse(access_token=token, user=User(**user_doc), tenant=Tenant(**tenant))


@api.get("/auth/me", response_model=User)
async def me(user: User = Depends(get_current_user)):
    return user


@api.get("/tenants")
async def list_tenants():
    docs = await db.tenants.find({}, {"_id": 0}).to_list(50)
    return docs


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


@api.get("/dashboard/summary")
async def dashboard_summary(user: User = Depends(get_current_user)):
    assets = await db.assets.find({"tenant_id": user.tenant_id}, {"_id": 0}).to_list(1000)
    total = len(assets)
    by_status = {"RUNNING": 0, "IDLE": 0, "FAULT": 0, "STOPPED": 0, "WARNING": 0, "CRITICAL": 0, "OFFLINE": 0}
    for a in assets:
        by_status[a.get("status", "OFFLINE")] = by_status.get(a.get("status", "OFFLINE"), 0) + 1
    running = by_status["RUNNING"] + by_status["WARNING"]
    fault = by_status["FAULT"] + by_status["CRITICAL"]
    healthy = sum(1 for a in assets if a["health"] >= 80)
    warning = sum(1 for a in assets if 55 <= a["health"] < 80)
    critical = sum(1 for a in assets if a["health"] < 55 and a["status"] != "OFFLINE")
    offline_h = sum(1 for a in assets if a["status"] == "OFFLINE")
    avg_health = round(sum(a["health"] for a in assets) / total, 1) if total else 0
    # Assets by area
    areas = await db.areas.find({"tenant_id": user.tenant_id}, {"_id": 0}).to_list(50)
    area_map = {a["id"]: a["name"] for a in areas}
    by_area: Dict[str, int] = {}
    for a in assets:
        by_area[area_map.get(a["area_id"], "Other")] = by_area.get(area_map.get(a["area_id"], "Other"), 0) + 1
    # Alarms
    alarms = await db.alarms.find(
        {"tenant_id": user.tenant_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    active_alarms = len(alarms)
    critical_alarms = sum(1 for a in alarms if a["severity"] == "CRITICAL")
    # Alarms trend (last 7 days count per day)
    trend: List[Dict[str, Any]] = []
    today = datetime.now(timezone.utc).date()
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        count = sum(1 for a in alarms if a["created_at"].startswith(d.isoformat()))
        # Simulate historical if none
        if count == 0:
            count = random.randint(3, 25)
        trend.append({"date": d.strftime("%d %b"), "count": count})
    # Top faulty assets
    top_faulty = sorted(assets, key=lambda a: a["health"])[:4]
    top_faulty_out = [{"asset_code": a["asset_code"], "health": a["health"],
                       "status": a["status"], "id": a["id"]} for a in top_faulty]

    return {
        "kpis": {
            "total_assets": total,
            "running": running,
            "idle": by_status["IDLE"],
            "fault": fault,
            "offline": by_status["OFFLINE"] + by_status["STOPPED"],
            "active_alarms": active_alarms,
            "critical_alarms": critical_alarms,
        },
        "health_overview": {
            "healthy": healthy,
            "warning": warning,
            "critical": critical,
            "offline": offline_h,
            "average": avg_health,
        },
        "assets_by_area": [{"area": k, "count": v} for k, v in sorted(by_area.items(), key=lambda x: -x[1])],
        "alarms_trend": trend,
        "recent_alarms": alarms[:8],
        "top_faulty_assets": top_faulty_out,
    }


# ---------------------------------------------------------------------------
# Assets
# ---------------------------------------------------------------------------


@api.get("/assets")
async def list_assets(
    user: User = Depends(get_current_user),
    area_id: Optional[str] = None,
    asset_type: Optional[str] = None,
    asset_status: Optional[str] = Query(None, alias="status"),
    q: Optional[str] = None,
):
    query: Dict[str, Any] = {"tenant_id": user.tenant_id}
    if area_id and area_id != "all":
        query["area_id"] = area_id
    if asset_type and asset_type != "all":
        query["asset_type"] = asset_type
    if asset_status and asset_status != "all":
        query["status"] = asset_status.upper()
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"asset_code": {"$regex": q, "$options": "i"}},
        ]
    assets = await db.assets.find(query, {"_id": 0}).to_list(1000)
    areas = await db.areas.find({"tenant_id": user.tenant_id}, {"_id": 0}).to_list(50)
    area_map = {a["id"]: a["name"] for a in areas}
    for a in assets:
        a["area_name"] = area_map.get(a["area_id"], "-")
    return assets


@api.post("/assets", response_model=Asset)
async def create_asset(payload: AssetCreate, user: User = Depends(get_current_user)):
    if user.role not in ("TENANT_ADMIN", "PRODUCTION_MANAGER"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["tenant_id"] = user.tenant_id
    doc["last_seen"] = datetime.now(timezone.utc).isoformat()
    await db.assets.insert_one(doc.copy())
    doc.pop("_id", None)
    return Asset(**doc)


@api.get("/assets/hierarchy")
async def asset_hierarchy(user: User = Depends(get_current_user)):
    plants = await db.plants.find({"tenant_id": user.tenant_id}, {"_id": 0}).to_list(50)
    areas = await db.areas.find({"tenant_id": user.tenant_id}, {"_id": 0}).to_list(200)
    assets = await db.assets.find({"tenant_id": user.tenant_id}, {"_id": 0}).to_list(1000)
    tree = []
    for p in plants:
        p_areas = []
        for a in [x for x in areas if x["plant_id"] == p["id"]]:
            p_areas.append({
                "id": a["id"],
                "name": a["name"],
                "assets": [{"id": x["id"], "name": x["name"], "asset_code": x["asset_code"],
                            "status": x["status"], "asset_type": x["asset_type"]}
                           for x in assets if x["area_id"] == a["id"]],
            })
        tree.append({"id": p["id"], "name": p["name"], "areas": p_areas})
    return tree


@api.get("/assets/{asset_id}")
async def get_asset(asset_id: str, user: User = Depends(get_current_user)):
    a = await db.assets.find_one({"id": asset_id, "tenant_id": user.tenant_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    area = await db.areas.find_one({"id": a["area_id"]}, {"_id": 0})
    plant = await db.plants.find_one({"id": a["plant_id"]}, {"_id": 0})
    a["area_name"] = area["name"] if area else "-"
    a["plant_name"] = plant["name"] if plant else "-"
    return a


@api.put("/assets/{asset_id}", response_model=Asset)
async def update_asset(asset_id: str, payload: AssetUpdate, user: User = Depends(get_current_user)):
    if user.role not in ("TENANT_ADMIN", "PRODUCTION_MANAGER"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = await db.assets.update_one({"id": asset_id, "tenant_id": user.tenant_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Asset not found")
    doc = await db.assets.find_one({"id": asset_id}, {"_id": 0})
    return Asset(**doc)


@api.get("/assets/{asset_id}/telemetry/latest")
async def latest_telemetry(asset_id: str, user: User = Depends(get_current_user)):
    a = await db.assets.find_one({"id": asset_id, "tenant_id": user.tenant_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    t = await db.telemetry.find_one({"asset_id": asset_id}, {"_id": 0}, sort=[("ts", -1)])
    return t or {}


@api.get("/assets/{asset_id}/telemetry/history")
async def telemetry_history(asset_id: str, user: User = Depends(get_current_user),
                            limit: int = 60):
    a = await db.assets.find_one({"id": asset_id, "tenant_id": user.tenant_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    rows = await db.telemetry.find({"asset_id": asset_id}, {"_id": 0}).sort("ts", -1).to_list(limit)
    return list(reversed(rows))


# ---------------------------------------------------------------------------
# Alarms
# ---------------------------------------------------------------------------


@api.get("/alarms")
async def list_alarms(user: User = Depends(get_current_user),
                      severity: Optional[str] = None,
                      acknowledged: Optional[bool] = None,
                      limit: int = 100):
    query: Dict[str, Any] = {"tenant_id": user.tenant_id}
    if severity:
        query["severity"] = severity.upper()
    if acknowledged is not None:
        query["acknowledged"] = acknowledged
    rows = await db.alarms.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return rows


@api.post("/alarms/{alarm_id}/acknowledge")
async def acknowledge_alarm(alarm_id: str, user: User = Depends(get_current_user)):
    res = await db.alarms.update_one(
        {"id": alarm_id, "tenant_id": user.tenant_id},
        {"$set": {"acknowledged": True, "acknowledged_by": user.email,
                  "acknowledged_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alarm not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Areas / Plants
# ---------------------------------------------------------------------------


@api.get("/areas")
async def list_areas(user: User = Depends(get_current_user)):
    return await db.areas.find({"tenant_id": user.tenant_id}, {"_id": 0}).to_list(200)


@api.get("/plants")
async def list_plants(user: User = Depends(get_current_user)):
    return await db.plants.find({"tenant_id": user.tenant_id}, {"_id": 0}).to_list(50)


# ---------------------------------------------------------------------------
# Telemetry ingest (Node-RED)
# ---------------------------------------------------------------------------


@api.post("/telemetry/ingest")
async def telemetry_ingest(
    payload: TelemetryIn,
    x_ingest_key: Annotated[Optional[str], Header(alias="X-Ingest-Key")] = None,
):
    """Ingest endpoint for Node-RED / OT gateway. Requires X-Ingest-Key header
    matching the server's INGEST_KEY (auto-generated on first boot and stored in backend/.env).
    """
    expected = os.environ.get("INGEST_KEY", "")
    if not expected or not x_ingest_key or not secrets.compare_digest(x_ingest_key, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing X-Ingest-Key")
    return await ingest_telemetry_internal(payload)


@api.get("/ingest/key-hint")
async def ingest_key_hint(user: User = Depends(get_current_user)):
    """Return a masked hint of the current ingest key (tenant admins only)."""
    if user.role != "TENANT_ADMIN":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    key = os.environ.get("INGEST_KEY", "")
    if not key:
        return {"configured": False}
    return {"configured": True, "hint": f"{key[:6]}…{key[-4:]}", "length": len(key)}


# ---------------------------------------------------------------------------
# CXO Comparison Board
# ---------------------------------------------------------------------------


@api.get("/dashboard/cxo-comparison")
async def cxo_comparison(user: User = Depends(get_current_user)):
    """Side-by-side plant KPIs for the CXO board."""
    plants = await db.plants.find({"tenant_id": user.tenant_id}, {"_id": 0}).to_list(50)
    assets = await db.assets.find({"tenant_id": user.tenant_id}, {"_id": 0}).to_list(2000)
    alarms = await db.alarms.find({"tenant_id": user.tenant_id, "acknowledged": False}, {"_id": 0}).to_list(500)

    out = []
    for p in plants:
        p_assets = [a for a in assets if a["plant_id"] == p["id"]]
        total = len(p_assets) or 1
        running = sum(1 for a in p_assets if a["status"] in ("RUNNING", "WARNING"))
        fault = sum(1 for a in p_assets if a["status"] in ("FAULT", "CRITICAL"))
        avg_health = round(sum(a["health"] for a in p_assets) / total, 1)
        # Deterministic mock KPIs seeded off plant code so demos are stable
        seed = sum(ord(c) for c in p["code"])
        rng = random.Random(seed)
        oee = round(65 + rng.random() * 25, 1)
        availability = round(80 + rng.random() * 18, 1)
        performance = round(75 + rng.random() * 22, 1)
        quality = round(90 + rng.random() * 9, 1)
        energy_kwh = round(4200 + rng.random() * 3200, 0)
        energy_cost = round(energy_kwh * 9.4, 0)  # INR/kWh
        carbon = round(energy_kwh * 0.82, 0)
        active_alarms = sum(1 for a in alarms if a["asset_id"] in {x["id"] for x in p_assets})
        out.append({
            "plant_id": p["id"],
            "name": p["name"],
            "location": p["location"],
            "code": p["code"],
            "total_assets": len(p_assets),
            "running_pct": round(running * 100 / total, 1),
            "fault_count": fault,
            "avg_health": avg_health,
            "oee": oee,
            "availability": availability,
            "performance": performance,
            "quality": quality,
            "energy_kwh": energy_kwh,
            "energy_cost_inr": energy_cost,
            "carbon_kg": carbon,
            "active_alarms": active_alarms,
        })
    # sort by OEE desc for a natural leaderboard
    out.sort(key=lambda x: x["oee"], reverse=True)
    return out


# ---------------------------------------------------------------------------
# Operator Runbook
# ---------------------------------------------------------------------------


class ProductionEntry(BaseModel):
    produced: int
    good: int
    reject: int = 0


@api.get("/operator/my-machine")
async def operator_my_machine(user: User = Depends(get_current_user)):
    if user.role != "OPERATOR":
        raise HTTPException(status_code=403, detail="Operators only")
    asset_id = user.assigned_asset_id
    if not asset_id:
        # Fallback to CNC-DEMO-01 for the demo
        demo = await db.assets.find_one({"tenant_id": user.tenant_id, "asset_code": "CNC-DEMO-01"}, {"_id": 0})
        if not demo:
            raise HTTPException(status_code=404, detail="No machine assigned")
        asset_id = demo["id"]
    a = await db.assets.find_one({"id": asset_id, "tenant_id": user.tenant_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Assigned machine not found")
    area = await db.areas.find_one({"id": a["area_id"]}, {"_id": 0})
    plant = await db.plants.find_one({"id": a["plant_id"]}, {"_id": 0})
    tele = await db.telemetry.find_one({"asset_id": a["id"]}, {"_id": 0}, sort=[("ts", -1)]) or {}
    alarms = await db.alarms.find(
        {"tenant_id": user.tenant_id, "asset_id": a["id"], "acknowledged": False},
        {"_id": 0},
    ).sort("created_at", -1).to_list(20)
    a["area_name"] = area["name"] if area else "-"
    a["plant_name"] = plant["name"] if plant else "-"
    return {"asset": a, "telemetry": tele, "alarms": alarms}


@api.post("/operator/production")
async def operator_submit_production(entry: ProductionEntry, user: User = Depends(get_current_user)):
    if user.role != "OPERATOR":
        raise HTTPException(status_code=403, detail="Operators only")
    if not user.assigned_asset_id:
        raise HTTPException(status_code=404, detail="No assigned machine")
    a = await db.assets.find_one({"id": user.assigned_asset_id, "tenant_id": user.tenant_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Machine not found")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": user.tenant_id,
        "asset_id": a["id"],
        "asset_code": a["asset_code"],
        "operator_id": user.id,
        "operator_name": user.name,
        "produced": entry.produced,
        "good": entry.good,
        "reject": entry.reject or max(0, entry.produced - entry.good),
        "ts": now,
    }
    await db.production_log.insert_one(doc.copy())
    # roll forward telemetry counts
    latest = await db.telemetry.find_one({"asset_id": a["id"]}, {"_id": 0}, sort=[("ts", -1)]) or {}
    payload = TelemetryIn(
        asset_id=a["id"],
        production_count=int(latest.get("production_count", 0)) + entry.produced,
        good_count=int(latest.get("good_count", 0)) + entry.good,
        reject_count=int(latest.get("reject_count", 0)) + (entry.reject or max(0, entry.produced - entry.good)),
    )
    await ingest_telemetry_internal(payload)
    doc.pop("_id", None)
    return {"ok": True, "entry": doc}


# ---------------------------------------------------------------------------
# Escalations
# ---------------------------------------------------------------------------


@api.get("/escalations")
async def list_escalations(user: User = Depends(get_current_user), limit: int = 50):
    rows = await db.escalations.find({"tenant_id": user.tenant_id}, {"_id": 0}).sort("escalated_at", -1).to_list(limit)
    return rows


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------


@api.websocket("/ws/telemetry")
async def ws_telemetry(websocket: WebSocket, token: Optional[str] = Query(None)):
    if not token:
        await websocket.close(code=4401)
        return
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        tenant_id = payload["tid"]
    except jwt.PyJWTError:
        await websocket.close(code=4401)
        return
    await ws_manager.connect(websocket, tenant_id)
    try:
        while True:
            await websocket.receive_text()  # ignore inbound
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, tenant_id)


# ---------------------------------------------------------------------------
# Mount
# ---------------------------------------------------------------------------


@api.get("/")
async def root():
    return {"service": "CoreOT APM", "status": "ok"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
