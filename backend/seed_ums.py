"""
One-off script to seed UMS (Utility Management System) demo data.

Creates (per plant, idempotent unless --force):
  - Utility assets across Water, Air, Gas, Oil-Fuel, Steam
  - Flow/pressure/consumption readings history
  - Alarms (flow anomaly, pressure deviation, leak detected)

Usage:
    cd backend
    python seed_ums.py --tenant-code SBF
    python seed_ums.py --tenant-code SBF --force
"""

import argparse
import asyncio
import os
import random
import uuid
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

UTILITY_SPECS = {
    "WATER": {"unit": "m3/h", "code": "WTR", "base_flow": 45, "base_pressure": 4.5, "names": ["Cooling Water Pump", "RO Plant Feed"]},
    "AIR": {"unit": "Nm3/min", "code": "AIR", "base_flow": 30, "base_pressure": 7.0, "names": ["Compressor 1", "Compressor 2"]},
    "GAS": {"unit": "Nm3/h", "code": "GAS", "base_flow": 15, "base_pressure": 2.0, "names": ["LPG Manifold", "Furnace Gas Line"]},
    "OIL_FUEL": {"unit": "L/h", "code": "OIL", "base_flow": 20, "base_pressure": 3.0, "names": ["Diesel Day Tank", "Furnace Oil Pump"]},
    "STEAM": {"unit": "T/h", "code": "STM", "base_flow": 5, "base_pressure": 8.0, "names": ["Boiler Header", "Process Steam Line"]},
}

ALARM_MSGS = {
    "WATER": [("MAJOR", "Flow rate below setpoint"), ("MINOR", "Pressure fluctuation")],
    "AIR": [("MAJOR", "Compressor abnormal cycling"), ("MINOR", "Receiver pressure low")],
    "GAS": [("CRITICAL", "Gas leak detected"), ("MAJOR", "Pressure deviation")],
    "OIL_FUEL": [("MAJOR", "Tank level low"), ("MINOR", "Pump vibration high")],
    "STEAM": [("MAJOR", "Header pressure drop"), ("MINOR", "Condensate return anomaly")],
}


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

    existing = await db.ums_assets.count_documents({"tenant_id": tid})
    if existing > 0 and not args.force:
        print(f"Tenant already has {existing} UMS assets. Skipping. Use --force to add more.")
        client.close()
        return

    plants = await db.plants.find({"tenant_id": tid}, {"_id": 0}).to_list(50)
    if not plants:
        raise RuntimeError("No plants found for this tenant. Seed plants first.")

    now = datetime.now(timezone.utc)
    counters = {k: 0 for k in UTILITY_SPECS}
    total_assets = 0
    total_readings = 0
    total_alarms = 0

    for plant in plants:
        for utype, spec in UTILITY_SPECS.items():
            for name in spec["names"]:
                counters[utype] += 1
                aid = str(uuid.uuid4())
                status = random.choices(["RUNNING", "IDLE", "FAULT"], weights=[7, 2, 1])[0]
                health = random.randint(75, 99) if status == "RUNNING" else (random.randint(50, 80) if status == "IDLE" else random.randint(20, 50))
                flow = round(spec["base_flow"] * random.uniform(0.8, 1.2), 1) if status == "RUNNING" else 0
                pressure = round(spec["base_pressure"] * random.uniform(0.85, 1.1), 2)
                consumption = round(flow * random.uniform(18, 24), 1)

                await db.ums_assets.insert_one({
                    "id": aid, "tenant_id": tid, "plant_id": plant["id"],
                    "utility_type": utype,
                    "asset_code": f"{spec['code']}-{counters[utype]:02d}",
                    "name": name, "status": status, "health": health,
                    "flow_rate": flow, "unit": spec["unit"], "pressure": pressure,
                    "consumption_today": consumption, "last_seen": now.isoformat(),
                })
                total_assets += 1

                # readings history
                f, p = flow, pressure
                readings = []
                for i in range(60):
                    f = max(0, f + random.uniform(-spec["base_flow"] * 0.05, spec["base_flow"] * 0.05))
                    p = max(0.1, p + random.uniform(-spec["base_pressure"] * 0.03, spec["base_pressure"] * 0.03))
                    readings.append({
                        "asset_id": aid, "tenant_id": tid,
                        "ts": (now - timedelta(minutes=5 * (60 - i))).isoformat(),
                        "flow_rate": round(f, 2), "pressure": round(p, 2),
                        "consumption": round(f * 5 / 60, 3),
                    })
                await db.ums_readings.insert_many(readings)
                total_readings += len(readings)

        # alarms — a handful per plant across utility types
        for _ in range(random.randint(4, 7)):
            utype = random.choice(list(UTILITY_SPECS.keys()))
            sev, msg = random.choice(ALARM_MSGS[utype])
            spec = UTILITY_SPECS[utype]
            asset_code = f"{spec['code']}-{random.randint(1, counters[utype]):02d}"
            await db.ums_alarms.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": tid, "plant_id": plant["id"],
                "asset_id": str(uuid.uuid4()),  # demo-only, not strictly linked
                "asset_code": asset_code, "utility_type": utype,
                "severity": sev, "message": msg, "acknowledged": random.random() > 0.6,
                "created_at": (now - timedelta(minutes=random.randint(5, 2000))).isoformat(),
            })
            total_alarms += 1

    print(f"Seeded {total_assets} UMS assets, {total_readings} readings, {total_alarms} alarms "
          f"across {len(plants)} plant(s).")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
