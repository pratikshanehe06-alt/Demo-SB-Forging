"""
One-off script to:
  1. Ensure a CNC-04 asset exists under the SBF tenant's Pune Plant.
  2. Backfill historical telemetry data for it (last N hours, one point
     every 5 seconds by default) so dashboards/charts have real data
     immediately, without needing Node-RED running continuously.

Usage:
    cd backend
    python seed_cnc04_telemetry.py                # backfills 2 hours
    python seed_cnc04_telemetry.py --hours 6       # backfills 6 hours
"""

import argparse
import asyncio
import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

ASSET_CODE = "CNC-04"


async def ensure_asset(db, sbf_tenant_id: str) -> Dict[str, Any]:
    existing = await db.assets.find_one({"asset_code": ASSET_CODE, "tenant_id": sbf_tenant_id}, {"_id": 0})
    if existing:
        print(f"Asset '{ASSET_CODE}' already exists ({existing['id']})")
        return existing

    # Find a plant + area to attach it to (prefer Pune Plant / Forging Area)
    plant = await db.plants.find_one({"tenant_id": sbf_tenant_id, "code": "PUN-01"}, {"_id": 0}) \
        or await db.plants.find_one({"tenant_id": sbf_tenant_id}, {"_id": 0})
    if not plant:
        raise RuntimeError("No plant found for SBF tenant. Run seed_dummy_data.py first.")

    area = await db.areas.find_one(
        {"tenant_id": sbf_tenant_id, "plant_id": plant["id"], "name": "Forging Area"}, {"_id": 0}
    ) or await db.areas.find_one({"tenant_id": sbf_tenant_id, "plant_id": plant["id"]}, {"_id": 0})
    if not area:
        raise RuntimeError("No area found under the plant. Run seed_dummy_data.py first.")

    asset = {
        "id": str(uuid.uuid4()),
        "tenant_id": sbf_tenant_id,
        "plant_id": plant["id"],
        "area_id": area["id"],
        "asset_code": ASSET_CODE,
        "name": "CNC-04",
        "asset_type": "CNC Machine",
        "manufacturer": "Siemens",
        "model": "S840D",
        "serial": f"SN-{random.randint(10000, 99999)}",
        "location": f"{plant.get('location', '-')} · {area['name']} · Bay {random.randint(1, 6)}",
        "criticality": "HIGH",
        "status": "RUNNING",
        "health": 92,
        "installation_date": "2023-03-15",
        "last_seen": datetime.now(timezone.utc).isoformat(),
    }
    await db.assets.insert_one(asset.copy())
    print(f"Created asset '{ASSET_CODE}' under plant '{plant['name']}' / area '{area['name']}'")
    return asset


async def backfill_telemetry(db, asset: Dict[str, Any], hours: float, interval_sec: int) -> None:
    now = datetime.now(timezone.utc)
    total_points = int((hours * 3600) / interval_sec)
    start = now - timedelta(hours=hours)

    state = {
        "temperature": 60.0,
        "vibration": 2.2,
        "pressure": 5.0,
        "rpm": 1400,
        "voltage": 415.0,
        "current": 11.8,
        "power": 8.2,
        "energy": 100.0,
        "production_count": 500,
        "good_count": 485,
        "reject_count": 15,
        "machine_status": "RUNNING",
    }

    docs = []
    for i in range(total_points):
        ts = start + timedelta(seconds=i * interval_sec)

        # occasional fault / recovery
        if state["machine_status"] == "RUNNING" and random.random() < 0.02:
            state["machine_status"] = "FAULT"
        elif state["machine_status"] == "FAULT" and random.random() < 0.3:
            state["machine_status"] = "RUNNING"

        if state["machine_status"] == "RUNNING":
            state["temperature"] = max(40, state["temperature"] + random.uniform(-0.6, 0.6))
            state["vibration"] = max(0.1, state["vibration"] + random.uniform(-0.25, 0.25))
            state["rpm"] = min(1600, max(1200, state["rpm"] + random.uniform(-15, 15)))
            state["voltage"] = 415 + random.uniform(-2, 2)
            state["current"] = max(5, state["current"] + random.uniform(-0.3, 0.3))
            state["power"] = max(4, state["power"] + random.uniform(-0.4, 0.4))
            state["pressure"] = max(1, state["pressure"] + random.uniform(-0.15, 0.15))
            state["energy"] += state["power"] / 3600 * interval_sec
            if random.random() < 0.5:
                state["production_count"] += 1
                if random.random() > 0.05:
                    state["good_count"] += 1
                else:
                    state["reject_count"] += 1
        else:
            state["temperature"] = min(110, state["temperature"] + 1.5)
            state["vibration"] = min(15, state["vibration"] + 0.5)

        doc = {
            "asset_id": asset["id"],
            "asset_code": ASSET_CODE,
            "tenant_id": asset["tenant_id"],
            "ts": ts.isoformat(),
            "machine_status": state["machine_status"],
            "temperature": round(state["temperature"], 2),
            "vibration": round(state["vibration"], 2),
            "pressure": round(state["pressure"], 2),
            "rpm": round(state["rpm"]),
            "voltage": round(state["voltage"], 1),
            "current": round(state["current"], 2),
            "power": round(state["power"], 2),
            "energy": round(state["energy"], 2),
            "production_count": state["production_count"],
            "good_count": state["good_count"],
            "reject_count": state["reject_count"],
        }
        docs.append(doc)

    if docs:
        await db.telemetry.insert_many(docs)

    # Update the asset's current status/health/last_seen to match the latest point
    last = docs[-1] if docs else None
    if last:
        health = 90 if last["machine_status"] == "RUNNING" else 42
        await db.assets.update_one(
            {"id": asset["id"]},
            {"$set": {"status": last["machine_status"], "health": health, "last_seen": last["ts"]}},
        )

    print(f"Backfilled {len(docs)} telemetry points over the last {hours} hour(s) "
          f"(one every {interval_sec}s)")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hours", type=float, default=2.0, help="How many hours of history to backfill")
    parser.add_argument("--interval", type=int, default=5, help="Seconds between telemetry points")
    args = parser.parse_args()

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    tenant = await db.tenants.find_one({"code": "SBF"}, {"_id": 0})
    if not tenant:
        raise RuntimeError("SBF tenant not found. Run seed_demo_users.py first.")

    asset = await ensure_asset(db, tenant["id"])
    await backfill_telemetry(db, asset, args.hours, args.interval)

    print("\nDone. View it via:")
    print(f"  GET /api/assets/{asset['id']}/telemetry/latest")
    print(f"  GET /api/assets/{asset['id']}/telemetry/history")
    print("Or in mongosh:")
    print(f'  db.telemetry.find({{asset_code: "{ASSET_CODE}"}}).sort({{ts:-1}}).limit(5).pretty()')

    client.close()


if __name__ == "__main__":
    asyncio.run(main())