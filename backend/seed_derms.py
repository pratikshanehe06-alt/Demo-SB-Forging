"""
One-off script to seed DERMS (Distributed Energy Resource Management) demo data.

Creates (per plant, idempotent unless --force):
  - Solar PV arrays + generation/PR readings
  - BESS units + SoC/power readings
  - EV charging stations
  - DG sets (with sync status)
  - DERMS events (inverter fault, BESS thermal, EV fault, DG sync loss)

Usage:
    cd backend
    python seed_derms.py --tenant-code SBF
    python seed_derms.py --tenant-code SBF --force
"""

import argparse
import asyncio
import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

EVENT_TYPES = [
    ("SOLAR", "INVERTER_FAULT", "HIGH"),
    ("SOLAR", "STRING_UNDERPERFORMANCE", "MEDIUM"),
    ("BESS", "THERMAL_WARNING", "HIGH"),
    ("BESS", "SOC_LOW", "MEDIUM"),
    ("EV", "CONNECTOR_FAULT", "MEDIUM"),
    ("DG", "SYNC_LOSS", "CRITICAL"),
    ("DG", "OVERLOAD", "HIGH"),
]


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

    existing = await db.solar_arrays.count_documents({"tenant_id": tid})
    if existing > 0 and not args.force:
        print(f"Tenant already has {existing} solar arrays. Skipping. Use --force to add more.")
        client.close()
        return

    plants = await db.plants.find({"tenant_id": tid}, {"_id": 0}).to_list(50)
    if not plants:
        raise RuntimeError("No plants found for this tenant. Seed plants first.")

    now = datetime.now(timezone.utc)
    hour = now.hour
    daylight = 6 <= hour <= 18
    solar_factor = max(0, 1 - abs(hour - 12) / 6) if daylight else 0

    counts = {"solar": 0, "bess": 0, "ev": 0, "dg": 0, "events": 0}

    for plant in plants:
        # ---- Solar arrays ----
        for i in range(2):
            aid = str(uuid.uuid4())
            capacity = random.choice([250, 500, 750])
            await db.solar_arrays.insert_one({
                "id": aid, "tenant_id": tid, "plant_id": plant["id"],
                "name": f"Solar Array {i+1}", "capacity_kwp": capacity,
                "status": "NORMAL", "last_seen": now.isoformat(),
            })
            counts["solar"] += 1
            readings = []
            for j in range(60):
                t = now - timedelta(minutes=5 * (60 - j))
                h = t.hour
                f = max(0, 1 - abs(h - 12) / 6) if 6 <= h <= 18 else 0
                gen = round(capacity * f * random.uniform(0.75, 0.95), 1)
                pr = round(75 + random.uniform(-5, 10), 1) if gen > 0 else 0
                readings.append({
                    "array_id": aid, "tenant_id": tid, "ts": t.isoformat(),
                    "generation_kw": gen, "irradiance_wm2": round(gen / max(capacity, 1) * 1000, 0),
                    "pr_pct": pr,
                })
            await db.solar_readings.insert_many(readings)

        # ---- BESS units ----
        for i in range(2):
            bid = str(uuid.uuid4())
            capacity = random.choice([500, 1000])
            await db.bess_units.insert_one({
                "id": bid, "tenant_id": tid, "plant_id": plant["id"],
                "name": f"BESS Unit {i+1}", "capacity_kwh": capacity,
                "rated_power_kw": capacity / 2, "status": "NORMAL",
                "soc_pct": round(random.uniform(40, 90), 1), "soh_pct": round(random.uniform(92, 100), 1),
                "mode": random.choice(["CHARGE", "DISCHARGE", "IDLE"]),
                "last_seen": now.isoformat(),
            })
            counts["bess"] += 1
            soc = random.uniform(40, 90)
            readings = []
            for j in range(60):
                soc = max(10, min(100, soc + random.uniform(-1.5, 1.5)))
                power = round(random.uniform(-capacity/4, capacity/4), 1)
                readings.append({
                    "unit_id": bid, "tenant_id": tid,
                    "ts": (now - timedelta(minutes=5 * (60 - j))).isoformat(),
                    "soc_pct": round(soc, 1), "power_kw": power,
                    "temperature_c": round(28 + random.uniform(-3, 6), 1),
                })
            await db.bess_readings.insert_many(readings)

        # ---- EV stations ----
        for i in range(2):
            connectors = random.choice([2, 4])
            active = random.randint(0, connectors)
            await db.ev_stations.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": tid, "plant_id": plant["id"],
                "name": f"EV Station {i+1}", "connectors_total": connectors,
                "connectors_active": active, "status": "NORMAL" if active < connectors else "WARNING",
                "power_kw": round(active * random.uniform(7, 22), 1), "last_seen": now.isoformat(),
            })
            counts["ev"] += 1

        # ---- DG sets ----
        for i in range(2):
            status = random.choice(["RUNNING", "STOPPED", "STOPPED"])
            await db.dg_sets.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": tid, "plant_id": plant["id"],
                "name": f"DG Set {i+1}", "rated_kva": random.choice([500, 750, 1000]),
                "status": status, "sync_status": "SYNCED" if status == "RUNNING" and random.random() > 0.15 else "NOT_SYNCED",
                "load_kw": round(random.uniform(100, 600), 1) if status == "RUNNING" else 0,
                "last_seen": now.isoformat(),
            })
            counts["dg"] += 1

        # ---- Events ----
        for _ in range(random.randint(3, 6)):
            source_type, etype, sev = random.choice(EVENT_TYPES)
            started = now - timedelta(hours=random.randint(1, 72))
            status = random.choice(["OPEN", "RESOLVED", "RESOLVED"])
            await db.derms_events.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": tid, "plant_id": plant["id"],
                "source_type": source_type, "source_name": f"{source_type.title()} unit",
                "event_type": etype, "severity": sev, "status": status,
                "started_at": started.isoformat(),
                "acknowledged": status == "RESOLVED",
                "acknowledged_by": "tenantadmin@sbforgtech.com" if status == "RESOLVED" else None,
                "acknowledged_at": (started + timedelta(minutes=15)).isoformat() if status == "RESOLVED" else None,
            })
            counts["events"] += 1

    print(f"Seeded per plant: {counts['solar']} solar arrays, {counts['bess']} BESS units, "
          f"{counts['ev']} EV stations, {counts['dg']} DG sets, {counts['events']} events "
          f"across {len(plants)} plant(s).")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
