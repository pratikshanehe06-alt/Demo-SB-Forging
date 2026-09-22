"""
One-off script to seed Fire & Safety demo data for a tenant.

Creates (idempotent per plant unless --force):
  - Fire zones (Zone 01-06)
  - Fire alarm events (some open, some resolved)
  - Hydrants with pressure readings + history
  - Sprinkler systems
  - Fire pumps (jockey/main/diesel) with pressure history
  - Fire-water tanks
  - Hooter events
  - Safety incidents

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

    existing = await db.fire_zones.count_documents({"tenant_id": tid})
    if existing > 0 and not args.force:
        print(f"Tenant already has {existing} fire zones. Skipping. Use --force to add more.")
        client.close()
        return

    # Ensure FIRE_SAFETY module is enabled
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
    zone_docs: List[Dict[str, Any]] = []
    for i, name in enumerate(ZONE_NAMES):
        zid = str(uuid.uuid4())
        zone_ids[name] = zid
        status = "ALARM" if i == 3 else ("ATTENTION" if i == 2 else "NORMAL")
        doc = {
            "id": zid, "tenant_id": tid, "plant_id": plant_id, "name": name,
            "status": status,
            "last_alarm_at": now.isoformat() if status != "NORMAL" else None,
        }
        zone_docs.append(doc)
    await db.fire_zones.insert_many(zone_docs)
    print(f"Seeded {len(zone_docs)} fire zones")

    # 2. Fire alarm events
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
            "zone_id": zone_ids[zone], "zone_name": zone,
            "event_type": etype, "severity": sev, "status": status,
            "created_at": (now - timedelta(minutes=15 * i)).isoformat(),
            "acknowledged": status != "OPEN",
            "acknowledged_by": "safety@sbforgtech.com" if status != "OPEN" else None,
            "acknowledged_at": (now - timedelta(minutes=10 * i)).isoformat() if status != "OPEN" else None,
            "comment": None,
        })
    await db.fire_alarm_events.insert_many(alarm_docs)
    print(f"Seeded {len(alarm_docs)} fire alarm events")

    # 3. Hydrants + pressure history
    hydrant_names = ["Hydrant Panel"]
    hydrant_docs = []
    for name in hydrant_names:
        hid = str(uuid.uuid4())
        hydrant_docs.append({
            "id": hid, "tenant_id": tid, "plant_id": plant_id, "name": name,
            "pressure_bar": 7.2, "status": "NORMAL",
            "warning_threshold": 6.0, "critical_threshold": 4.0,
            "last_seen": now.isoformat(),
        })
        readings = []
        pressure = 7.0
        for i in range(60):
            pressure = max(3.5, min(8.0, pressure + random.uniform(-0.15, 0.15)))
            readings.append({
                "hydrant_id": hid, "tenant_id": tid,
                "ts": (now - timedelta(minutes=(60 - i))).isoformat(),
                "pressure_bar": round(pressure, 2),
            })
        await db.hydrant_readings.insert_many(readings)
    await db.hydrants.insert_many(hydrant_docs)
    print(f"Seeded {len(hydrant_docs)} hydrants with pressure history")

    # 4. Sprinkler systems
    sprinkler_docs = [{
        "id": str(uuid.uuid4()), "tenant_id": tid, "plant_id": plant_id,
        "name": "Sprinkler System", "status": "READY",
        "zones_ready": 4, "zones_total": 4, "last_seen": now.isoformat(),
    }]
    await db.sprinkler_systems.insert_many(sprinkler_docs)
    print(f"Seeded {len(sprinkler_docs)} sprinkler systems")

    # 5. Fire pumps + pressure history
    pump_specs = [
        ("Jockey Pump", "JOCKEY", "RUNNING", 7.2, 12),
        ("Main Pump 1", "MAIN_ELECTRIC", "READY", 7.1, 0),
        ("Main Pump 2", "MAIN_ELECTRIC", "READY", 7.1, 0),
        ("Diesel Pump", "DIESEL", "READY", 6.9, 0),
    ]
    pump_docs = []
    for name, ptype, status, pressure, runtime in pump_specs:
        pid = str(uuid.uuid4())
        pump_docs.append({
            "id": pid, "tenant_id": tid, "plant_id": plant_id, "name": name,
            "pump_type": ptype, "status": status, "pressure_bar": pressure,
            "runtime_min_today": runtime,
            "last_start_at": (now - timedelta(hours=2)).isoformat() if runtime else None,
            "next_maintenance_due": (now + timedelta(days=random.randint(10, 60))).isoformat(),
        })
        readings = []
        p = pressure
        for i in range(60):
            p = max(3, min(8, p + random.uniform(-0.1, 0.1)))
            readings.append({
                "pump_id": pid, "tenant_id": tid,
                "ts": (now - timedelta(minutes=(60 - i))).isoformat(),
                "pressure_bar": round(p, 2),
            })
        await db.fire_pump_readings.insert_many(readings)
    await db.fire_pumps.insert_many(pump_docs)
    print(f"Seeded {len(pump_docs)} fire pumps with pressure history")

    # 6. Fire-water tank
    tank_docs = [{
        "id": str(uuid.uuid4()), "tenant_id": tid, "plant_id": plant_id,
        "name": "Fire Water Tank", "capacity_liters": 500000,
        "current_level_pct": 82.0, "warning_threshold_pct": 40.0,
        "critical_threshold_pct": 20.0, "last_seen": now.isoformat(),
    }]
    await db.fire_water_tanks.insert_many(tank_docs)
    print(f"Seeded {len(tank_docs)} fire-water tanks")

    # 7. Hooter events
    hooter_docs = [{
        "id": str(uuid.uuid4()), "tenant_id": tid, "plant_id": plant_id,
        "name": "Emergency Hooter", "state": "OFF",
        "activated_at": (now - timedelta(hours=6)).isoformat(),
        "duration_sec": 45, "acknowledged": True, "incident_id": None,
    }]
    await db.hooter_events.insert_many(hooter_docs)
    print(f"Seeded {len(hooter_docs)} hooter events")

    # 8. Safety incidents
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

    print("\nFire & Safety demo data seeding complete.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())