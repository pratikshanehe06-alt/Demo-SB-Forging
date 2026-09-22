"""
One-off script to seed Power Quality Intelligence (PQI) demo data.

Creates (per plant, idempotent unless --force):
  - PQI Mains (incoming feeders)
  - Power quality readings (60 points per main): voltage, PF, THD-V, THD-I, frequency
  - Power quality events: sags, swells, harmonic distortion, frequency deviation

Usage:
    cd backend
    python seed_pqi.py --tenant-code SBF
    python seed_pqi.py --tenant-code SBF --force
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

MAIN_NAMES = ["Incoming Main 1", "Incoming Main 2", "DG Sync Bus"]

EVENT_TYPES = [
    ("VOLTAGE_SAG", "MEDIUM"),
    ("VOLTAGE_SWELL", "MEDIUM"),
    ("HARMONIC_DISTORTION", "HIGH"),
    ("FREQUENCY_DEVIATION", "HIGH"),
    ("VOLTAGE_UNBALANCE", "LOW"),
    ("INTERRUPTION", "CRITICAL"),
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

    existing = await db.pqi_mains.count_documents({"tenant_id": tid})
    if existing > 0 and not args.force:
        print(f"Tenant already has {existing} PQI mains. Skipping. Use --force to add more.")
        client.close()
        return

    plants = await db.plants.find({"tenant_id": tid}, {"_id": 0}).to_list(50)
    if not plants:
        raise RuntimeError("No plants found for this tenant. Seed plants first.")

    now = datetime.now(timezone.utc)
    total_mains = 0
    total_readings = 0
    total_events = 0

    for plant in plants:
        for name in MAIN_NAMES[: 2 if plant.get("code") != "PUN-01" else 3]:
            main_id = str(uuid.uuid4())
            await db.pqi_mains.insert_one({
                "id": main_id, "tenant_id": tid, "plant_id": plant["id"], "name": name,
                "rated_voltage": 415.0, "rated_current": random.choice([630, 800, 1250]),
                "status": "NORMAL",
            })
            total_mains += 1

            # readings — 60 points, 5 min apart, gentle drift with occasional dips
            voltage = 415.0
            pf = 0.94
            thd_v = 2.5
            thd_i = 4.0
            freq = 50.0
            readings = []
            for i in range(60):
                voltage = max(370, min(440, voltage + random.uniform(-2, 2)))
                pf = max(0.75, min(0.99, pf + random.uniform(-0.01, 0.01)))
                thd_v = max(0.5, min(8, thd_v + random.uniform(-0.3, 0.3)))
                thd_i = max(1, min(12, thd_i + random.uniform(-0.4, 0.4)))
                freq = max(49.2, min(50.8, freq + random.uniform(-0.05, 0.05)))
                readings.append({
                    "main_id": main_id, "tenant_id": tid,
                    "ts": (now - timedelta(minutes=5 * (60 - i))).isoformat(),
                    "voltage_r": round(voltage + random.uniform(-1, 1), 1),
                    "voltage_y": round(voltage + random.uniform(-1, 1), 1),
                    "voltage_b": round(voltage + random.uniform(-1, 1), 1),
                    "frequency_hz": round(freq, 3),
                    "thd_voltage_pct": round(thd_v, 2),
                    "thd_current_pct": round(thd_i, 2),
                    "power_factor": round(pf, 3),
                    "voltage_unbalance_pct": round(random.uniform(0.2, 2.5), 2),
                })
            await db.pqi_readings.insert_many(readings)
            total_readings += len(readings)

            # events — 2-4 per main, mostly resolved, one open
            n_events = random.randint(2, 4)
            for i in range(n_events):
                etype, sev = random.choice(EVENT_TYPES)
                started = now - timedelta(hours=random.randint(1, 72))
                is_last = i == n_events - 1
                status = "OPEN" if is_last and random.random() < 0.4 else "RESOLVED"
                duration_ms = random.randint(200, 8000)
                await db.pqi_events.insert_one({
                    "id": str(uuid.uuid4()), "tenant_id": tid, "plant_id": plant["id"],
                    "main_id": main_id, "main_name": name,
                    "event_type": etype, "severity": sev,
                    "value": round(random.uniform(1, 15), 2),
                    "threshold": round(random.uniform(1, 10), 2),
                    "started_at": started.isoformat(),
                    "ended_at": None if status == "OPEN" else (started + timedelta(milliseconds=duration_ms)).isoformat(),
                    "duration_ms": duration_ms,
                    "status": status,
                    "acknowledged": status == "RESOLVED",
                    "acknowledged_by": "tenantadmin@sbforgtech.com" if status == "RESOLVED" else None,
                    "acknowledged_at": (started + timedelta(minutes=10)).isoformat() if status == "RESOLVED" else None,
                })
                total_events += 1

    print(f"Seeded {total_mains} PQI mains, {total_readings} readings, {total_events} events "
          f"across {len(plants)} plant(s).")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
