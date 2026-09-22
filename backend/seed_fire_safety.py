"""
One-off script to seed Fire & Safety demo data using the unified
`fire_assets` collection (same shape/pattern as APM's `assets`),
instead of separate hydrants/sprinklers/pumps/tanks/hooters collections.

Creates (idempotent per plant unless --force):
  - Fire zones
  - Fire assets: hydrants, sprinkler systems, fire pumps, fire-water
    tanks, hooters — all in one `fire_assets` collection with an
    `asset_type` field, exactly like APM assets have `asset_type`.
  - fire_asset_readings — history for pressure/level-bearing assets
  - maintenance_records — reused from the same collection APM assets use
  - Fire alarm events (zone-based) and safety incidents

Usage:
    cd backend
    python seed_fire_safety.py --tenant-code SBF
    python seed_fire_safety.py --tenant-code SBF --force
"""

import argparse
import asyncio
import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

ZONE_NAMES = ["Zone 01", "Zone 02", "Zone 03", "Zone 04", "Zone 05", "Zone 06"]


async def add_readings(db, asset_id, tid, metric_key, base, spread, minutes=60, step=5):
    now = datetime.now(timezone.utc)
    val = base
    readings = []
    for i in range(minutes):
        val = max(0, val + random.uniform(-spread, spread))
        readings.append({
            "asset_id": asset_id, "tenant_id": tid,
            "ts": (now - timedelta(minutes=step * (minutes - i))).isoformat(),
            metric_key: round(val, 2),
        })
    if readings:
        await db.fire_asset_readings.insert_many(readings)
    return round(val, 2)


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tenant-code", default="SBF")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    tenant = await db.tenants.find_one({"code": args.tenant_code.upper()})
    if not tenant:
        raise RuntimeError(f"Tenant '{args.tenant_code}' not found.")
    tid = tenant["id"]

    existing = await db.fire_assets.count_documents({"tenant_id": tid})
    if existing > 0 and not args.force:
        print(f"Tenant already has {existing} fire assets. Skipping. Use --force to add more.")
        client.close()
        return

    tm = await db.tenant_modules.find_one({"tenant_id": tid})
    if tm:
        mods = tm.get("modules", {})
        mods["FIRE_SAFETY"] = True
        await db.tenant_modules.update_one({"tenant_id": tid}, {"$set": {"modules": mods}})
    else:
        await db.tenant_modules.insert_one({"tenant_id": tid, "modules": {"FIRE_SAFETY": True, "REPORTS": True, "AUDIT": True}})

    plant = await db.plants.find_one({"tenant_id": tid}, {"_id": 0})
    if not plant:
        raise RuntimeError("No plant found for this tenant. Seed plants first.")
    plant_id = plant["id"]
    now = datetime.now(timezone.utc)

    # 1. Fire zones
    zone_ids: Dict[str, str] = {}
    zone_docs = []
    for i, name in enumerate(ZONE_NAMES):
        zid = str(uuid.uuid4())
        zone_ids[name] = zid
        status = "ALARM" if i == 3 else ("ATTENTION" if i == 2 else "NORMAL")
        zone_docs.append({
            "id": zid, "tenant_id": tid, "plant_id": plant_id, "name": name,
            "status": status, "last_alarm_at": now.isoformat() if status != "NORMAL" else None,
        })
    await db.fire_zones.insert_many(zone_docs)
    print(f"Seeded {len(zone_docs)} fire zones")

    fire_asset_docs = []
    asset_ids_by_type: Dict[str, List[str]] = {"HYDRANT": [], "SPRINKLER_SYSTEM": [], "FIRE_PUMP": [], "FIRE_WATER_TANK": [], "HOOTER": []}

    # 2. Hydrant
    hid = str(uuid.uuid4())
    fire_asset_docs.append({
        "id": hid, "tenant_id": tid, "plant_id": plant_id, "zone_id": zone_ids["Zone 01"],
        "asset_code": "HYD-01", "name": "Hydrant Panel", "asset_type": "HYDRANT",
        "status": "NORMAL", "health": 92, "criticality": "HIGH", "last_seen": now.isoformat(),
        "metrics": {},
    })
    asset_ids_by_type["HYDRANT"].append(hid)

    # 3. Sprinkler system
    sid = str(uuid.uuid4())
    fire_asset_docs.append({
        "id": sid, "tenant_id": tid, "plant_id": plant_id, "zone_id": zone_ids["Zone 02"],
        "asset_code": "SPR-01", "name": "Sprinkler System", "asset_type": "SPRINKLER_SYSTEM",
        "status": "NORMAL", "health": 96, "criticality": "HIGH", "last_seen": now.isoformat(),
        "metrics": {"zones_ready": 4, "zones_total": 4},
    })
    asset_ids_by_type["SPRINKLER_SYSTEM"].append(sid)

    # 4. Fire pumps
    pump_specs = [
        ("Jockey Pump", "RUNNING", 7.2, 12),
        ("Main Pump 1", "NORMAL", 7.1, 0),
        ("Main Pump 2", "NORMAL", 7.1, 0),
        ("Diesel Pump", "NORMAL", 6.9, 0),
    ]
    for i, (name, status, pressure, runtime) in enumerate(pump_specs):
        pid = str(uuid.uuid4())
        fire_asset_docs.append({
            "id": pid, "tenant_id": tid, "plant_id": plant_id, "zone_id": zone_ids["Zone 01"],
            "asset_code": f"PMP-{i+1:02d}", "name": name, "asset_type": "FIRE_PUMP",
            "status": status if status != "RUNNING" else "NORMAL", "health": random.randint(85, 98),
            "criticality": "HIGH", "last_seen": now.isoformat(),
            "metrics": {"pressure_bar": pressure, "runtime_min_today": runtime},
        })
        asset_ids_by_type["FIRE_PUMP"].append(pid)

    # 5. Fire-water tank
    tid_asset = str(uuid.uuid4())
    fire_asset_docs.append({
        "id": tid_asset, "tenant_id": tid, "plant_id": plant_id, "zone_id": zone_ids["Zone 05"],
        "asset_code": "TNK-01", "name": "Fire Water Tank", "asset_type": "FIRE_WATER_TANK",
        "status": "NORMAL", "health": 90, "criticality": "HIGH", "last_seen": now.isoformat(),
        "metrics": {"capacity_liters": 500000, "level_pct": 82.0},
    })
    asset_ids_by_type["FIRE_WATER_TANK"].append(tid_asset)

    # 6. Hooter
    hooter_id = str(uuid.uuid4())
    fire_asset_docs.append({
        "id": hooter_id, "tenant_id": tid, "plant_id": plant_id, "zone_id": zone_ids["Zone 06"],
        "asset_code": "HTR-01", "name": "Emergency Hooter", "asset_type": "HOOTER",
        "status": "NORMAL", "health": 100, "criticality": "MEDIUM", "last_seen": now.isoformat(),
        "metrics": {"last_activated_at": (now - timedelta(hours=6)).isoformat(), "duration_sec": 45},
    })
    asset_ids_by_type["HOOTER"].append(hooter_id)

    await db.fire_assets.insert_many(fire_asset_docs)
    print(f"Seeded {len(fire_asset_docs)} fire assets (hydrant, sprinkler, 4 pumps, tank, hooter)")

    # 7. Readings history (pressure/level bearing assets)
    await add_readings(db, hid, tid, "pressure_bar", 7.0, 0.15)
    for pid in asset_ids_by_type["FIRE_PUMP"]:
        await add_readings(db, pid, tid, "pressure_bar", 7.0, 0.1)
    await add_readings(db, tid_asset, tid, "level_pct", 82.0, 0.5, minutes=30, step=60)
    print("Seeded pressure/level history for hydrant, pumps and tank")

    # 8. Maintenance records (reusing the shared maintenance_records collection)
    m_types = ["PREVENTIVE", "CORRECTIVE", "PREDICTIVE"]
    m_desc = ["Pressure test", "Valve inspection", "Seal replacement", "Panel calibration", "Battery check"]
    techs = ["A. Sharma", "R. Iyer", "M. Patil"]
    m_count = 0
    for atype, ids in asset_ids_by_type.items():
        for aid in ids:
            asset_doc = next(a for a in fire_asset_docs if a["id"] == aid)
            for _ in range(random.randint(1, 3)):
                performed = now - timedelta(days=random.randint(5, 150))
                next_due = performed + timedelta(days=random.randint(30, 120))
                await db.maintenance_records.insert_one({
                    "id": str(uuid.uuid4()), "tenant_id": tid, "asset_id": aid,
                    "asset_code": asset_doc["asset_code"], "type": random.choice(m_types),
                    "description": random.choice(m_desc), "technician": random.choice(techs),
                    "cost_inr": random.randint(1000, 15000),
                    "performed_at": performed.isoformat(), "next_due_at": next_due.isoformat(),
                })
                m_count += 1
    print(f"Seeded {m_count} maintenance records for fire assets")

    # 9. Fire alarm events (zone-based, unchanged)
    alarm_events = [
        ("Zone 04", "SMOKE_DETECTED", "CRITICAL", "OPEN"),
        ("Zone 02", "HEAT_DETECTED", "HIGH", "ACKNOWLEDGED"),
        ("Zone 03", "MANUAL_CALL_POINT", "MEDIUM", "INVESTIGATING"),
        ("Zone 01", "PANEL_FAULT", "LOW", "RESOLVED"),
        ("Zone 05", "SMOKE_DETECTED", "MEDIUM", "RESOLVED"),
    ]
    alarm_docs = []
    for i, (zone, etype, sev, status) in enumerate(alarm_events):
        alarm_docs.append({
            "id": str(uuid.uuid4()), "tenant_id": tid, "plant_id": plant_id,
            "zone_id": zone_ids[zone], "zone_name": zone, "event_type": etype, "severity": sev, "status": status,
            "created_at": (now - timedelta(minutes=15 * i)).isoformat(),
            "acknowledged": status != "OPEN",
            "acknowledged_by": "safety@sbforgtech.com" if status != "OPEN" else None,
            "acknowledged_at": (now - timedelta(minutes=10 * i)).isoformat() if status != "OPEN" else None,
            "comment": None,
        })
    await db.fire_alarm_events.insert_many(alarm_docs)
    print(f"Seeded {len(alarm_docs)} fire alarm events")

    # 10. Safety incidents (unchanged)
    incident_specs = [
        ("Smoke Detected", "CRITICAL", "OPEN", "Zone 04", "Safety"),
        ("Low Hydrant Pressure", "HIGH", "ACKNOWLEDGED", "Zone 02", "Maintenance"),
        ("Pump Start Anomaly", "MEDIUM", "INVESTIGATING", "Zone 01", "Engineering"),
        ("Hooter Test", "LOW", "RESOLVED", "Zone 06", "-"),
        ("Tank Level Low", "MEDIUM", "RESOLVED", "Zone 03", "Operations"),
    ]
    incident_docs = []
    for i, (event, sev, status, zone, assigned) in enumerate(incident_specs):
        incident_docs.append({
            "id": str(uuid.uuid4()), "tenant_id": tid, "plant_id": plant_id,
            "zone_id": zone_ids.get(zone), "event": event, "severity": sev, "status": status,
            "assigned_to": assigned, "created_at": (now - timedelta(minutes=20 * i)).isoformat(),
            "resolved_at": now.isoformat() if status in ("RESOLVED", "CLOSED") else None,
        })
    await db.safety_incidents.insert_many(incident_docs)
    print(f"Seeded {len(incident_docs)} safety incidents")

    print("\nFire & Safety demo data seeding complete (unified fire_assets collection).")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
