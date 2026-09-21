"""
One-off script to populate full simulation / dummy data for the CoreOT
demo tenant (SB Forgtech Pvt Ltd / "SBF") — plants, areas, assets,
alarms, production lines, downtime events, energy records, production
logs and maintenance history.

This mirrors the seed_database() logic already in server.py, but:
  - runs standalone (doesn't require restarting the backend / dropping DB)
  - is safe to re-run: skips asset/plant seeding if SBF already has assets
  - assumes tenants + users already exist (run seed_demo_users.py first
    if you haven't created the demo accounts yet)

Usage:
    cd backend
    python seed_dummy_data.py

    # Force re-seed even if assets already exist for SBF:
    python seed_dummy_data.py --force
"""

import asyncio
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

FORCE = "--force" in sys.argv

AREAS_SEED = ["Forging Area", "Heat Treatment", "Utilities", "Storage"]

ASSET_TYPES = {
    "Forging Area": ["Hydraulic Press", "Forging Hammer", "CNC Machine"],
    "Heat Treatment": ["Induction Furnace", "Quench Tank", "Tempering Oven"],
    "Utilities": ["Air Compressor", "Water Chiller", "Cooling Tower"],
    "Storage": ["Overhead Crane", "Conveyor"],
}

STATUS_POOL = ["RUNNING"] * 6 + ["IDLE"] * 2 + ["FAULT"] + ["OFFLINE"]


async def main() -> None:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # 1. Find (or create) the SBF tenant
    tenant = await db.tenants.find_one({"code": "SBF"})
    if not tenant:
        tenant_id = str(uuid.uuid4())
        await db.tenants.insert_one({"id": tenant_id, "code": "SBF", "name": "SB Forgtech Pvt Ltd"})
        print(f"Created tenant 'SBF' ({tenant_id})")
    else:
        tenant_id = tenant["id"]
        print(f"Using existing tenant 'SBF' ({tenant_id})")
    sbf = tenant_id

    # 2. Guard: skip if already seeded (unless --force)
    existing_assets = await db.assets.count_documents({"tenant_id": sbf})
    if existing_assets > 0 and not FORCE:
        print(f"SBF already has {existing_assets} assets. Skipping seed. "
              f"Re-run with --force to add more anyway.")
        client.close()
        return

    print("Seeding simulation data for SBF...")

    # 3. Plant + areas (Pune Plant)
    plant_id = str(uuid.uuid4())
    await db.plants.insert_one({
        "id": plant_id, "tenant_id": sbf, "name": "Pune Plant",
        "code": "PUN-01", "location": "Pune, MH",
    })

    # 4. Additional plants (Mumbai, Nashik) for CXO comparison board
    for pname, pcode, ploc in [
        ("Mumbai Plant", "MUM-01", "Mumbai, MH"),
        ("Nashik Plant", "NSK-01", "Nashik, MH"),
    ]:
        pid = str(uuid.uuid4())
        await db.plants.insert_one({"id": pid, "tenant_id": sbf, "name": pname, "code": pcode, "location": ploc})
        aid = str(uuid.uuid4())
        await db.areas.insert_one({"id": aid, "tenant_id": sbf, "plant_id": pid, "name": "Main Line"})
        for i in range(8):
            atype = random.choice(["Hydraulic Press", "Induction Furnace", "Air Compressor", "Water Chiller"])
            st = random.choice(STATUS_POOL)
            health_map = {"RUNNING": (75, 99), "IDLE": (60, 90), "FAULT": (30, 55), "OFFLINE": (0, 40)}
            low, high = health_map.get(st, (50, 90))
            await db.assets.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": sbf, "plant_id": pid, "area_id": aid,
                "asset_code": f"{pcode}-{atype.split()[0][:3].upper()}-{i+1:02d}",
                "name": f"{atype} {i+1}", "asset_type": atype,
                "manufacturer": random.choice(["Siemens", "ABB", "Bosch"]),
                "model": f"M-{random.randint(100,999)}", "serial": f"SN-{random.randint(10000,99999)}",
                "criticality": random.choice(["LOW", "MEDIUM", "HIGH"]),
                "status": st, "health": random.randint(low, high),
                "installation_date": f"20{random.randint(19,23)}-06-01",
                "last_seen": datetime.now(timezone.utc).isoformat(),
            })
        print(f"  Seeded plant '{pname}' with 8 assets")

    # 5. Areas under Pune Plant
    area_ids: Dict[str, str] = {}
    for a in AREAS_SEED:
        aid = str(uuid.uuid4())
        area_ids[a] = aid
        await db.areas.insert_one({"id": aid, "tenant_id": sbf, "plant_id": plant_id, "name": a})

    # 6. Demo CNC anchor asset
    cnc_demo_id = str(uuid.uuid4())
    await db.assets.insert_one({
        "id": cnc_demo_id, "tenant_id": sbf, "plant_id": plant_id, "area_id": area_ids["Forging Area"],
        "asset_code": "CNC-DEMO-01", "name": "CNC Demo Machine", "asset_type": "CNC Machine",
        "manufacturer": "Siemens", "model": "S840D", "serial": "SN-DEMO-001",
        "location": "Pune, MH · Forging Area · Bay 1", "criticality": "HIGH", "status": "RUNNING",
        "health": 91, "installation_date": "2022-04-10", "last_seen": datetime.now(timezone.utc).isoformat(),
    })

    # Assign to operator user if it exists
    await db.users.update_one(
        {"email": "operator@sbforgtech.com"},
        {"$set": {"assigned_asset_id": cnc_demo_id}},
    )

    # 7. Remaining assets (~45 total for Pune Plant)
    counter = {"Hydraulic Press": 0, "Forging Hammer": 0, "CNC Machine": 1, "Induction Furnace": 0,
               "Quench Tank": 0, "Tempering Oven": 0, "Air Compressor": 0, "Water Chiller": 0,
               "Cooling Tower": 0, "Overhead Crane": 0, "Conveyor": 0}

    async def add_asset(area: str, atype: str, status_hint: Optional[str] = None, health_hint: Optional[int] = None):
        counter[atype] += 1
        code_prefix_map = {
            "Hydraulic Press": "Press", "Forging Hammer": "Hammer", "CNC Machine": "CNC",
            "Induction Furnace": "Furnace", "Quench Tank": "Quench", "Tempering Oven": "Oven",
            "Air Compressor": "Compressor", "Water Chiller": "Chiller", "Cooling Tower": "Tower",
            "Overhead Crane": "Crane", "Conveyor": "Conveyor",
        }
        code = f"{code_prefix_map[atype]}-{counter[atype]:02d}"
        st = status_hint or random.choice(STATUS_POOL)
        health_map = {"RUNNING": (75, 99), "IDLE": (60, 90), "FAULT": (30, 55), "OFFLINE": (0, 40)}
        low, high = health_map.get(st, (50, 90))
        h = health_hint if health_hint is not None else random.randint(low, high)
        await db.assets.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": sbf, "plant_id": plant_id, "area_id": area_ids[area],
            "asset_code": code, "name": code, "asset_type": atype,
            "manufacturer": random.choice(["Siemens", "ABB", "Bosch", "Kirloskar", "L&T"]),
            "model": f"M-{random.randint(100,999)}", "serial": f"SN-{random.randint(10000,99999)}",
            "location": f"Pune, MH · {area} · Bay {random.randint(1, 6)}",
            "criticality": random.choice(["LOW", "MEDIUM", "HIGH"]), "status": st, "health": h,
            "installation_date": f"20{random.randint(18,23)}-0{random.randint(1,9)}-15",
            "last_seen": datetime.now(timezone.utc).isoformat(),
        })

    await add_asset("Forging Area", "Hydraulic Press", "RUNNING", 98)
    await add_asset("Forging Area", "Hydraulic Press", "FAULT", 45)
    await add_asset("Heat Treatment", "Induction Furnace", "RUNNING", 70)
    await add_asset("Heat Treatment", "Induction Furnace", "IDLE", 68)
    await add_asset("Utilities", "Air Compressor", "RUNNING", 82)
    await add_asset("Utilities", "Water Chiller", "RUNNING", 80)

    plan = [("Forging Area", 12), ("Heat Treatment", 8), ("Utilities", 10), ("Storage", 8)]
    for area, n in plan:
        for _ in range(n):
            atype = random.choice(ASSET_TYPES[area])
            await add_asset(area, atype)

    print("  Seeded ~45 assets across Forging/Heat Treatment/Utilities/Storage")

    # 8. Alarms
    all_assets = await db.assets.find({"tenant_id": sbf}, {"_id": 0}).to_list(500)
    alarm_msgs = [
        ("CRITICAL", "Hydraulic Pressure High"), ("CRITICAL", "Temperature Critical"),
        ("MAJOR", "Vibration High"), ("MAJOR", "Temperature High"),
        ("MINOR", "Coolant Flow Low"), ("MINOR", "Power Factor Drop"),
        ("MAJOR", "RPM Deviation"), ("MINOR", "Filter Clogged"),
        ("CRITICAL", "Bearing Overheat"), ("MAJOR", "Oil Pressure Drop"),
        ("MINOR", "Air Leak Detected"), ("MAJOR", "Motor Overload"),
    ]
    faulty_assets = [a for a in all_assets if a["status"] in ("FAULT", "IDLE")] or all_assets
    now = datetime.now(timezone.utc)
    for i, (sev, msg) in enumerate(alarm_msgs):
        a = random.choice(faulty_assets)
        await db.alarms.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": sbf, "asset_id": a["id"], "asset_code": a["asset_code"],
            "severity": sev, "message": msg, "acknowledged": False,
            "created_at": (now - timedelta(minutes=15 * i)).isoformat(),
        })
    print(f"  Seeded {len(alarm_msgs)} alarms")

    # 9. Lines (for OEE per-line breakdown)
    lines_seed = [
        ("Forging Area", "Forge Line 1"), ("Forging Area", "Forge Line 2"),
        ("Heat Treatment", "Anneal Line"), ("Heat Treatment", "Temper Line"),
        ("Utilities", "Utility Loop"),
    ]
    for area_name, line_name in lines_seed:
        await db.lines.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": sbf, "plant_id": plant_id,
            "area_id": area_ids[area_name], "name": line_name,
            "ideal_rate_per_hr": random.randint(40, 80),
        })
    print(f"  Seeded {len(lines_seed)} production lines")

    # 10. Downtime events (last 7 days)
    reasons = ["Tool change", "Material shortage", "Breakdown", "Setup", "No operator", "Power dip"]
    for i in range(24):
        a = random.choice(all_assets)
        started = now - timedelta(days=random.randint(0, 6), hours=random.randint(0, 23))
        duration = random.randint(5, 60)
        await db.downtime_events.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": sbf, "asset_id": a["id"], "asset_code": a["asset_code"],
            "plant_id": a["plant_id"], "reason": random.choice(reasons), "duration_min": duration,
            "started_at": started.isoformat(), "ended_at": (started + timedelta(minutes=duration)).isoformat(),
        })
    print("  Seeded 24 downtime events")

    # 11. Energy records (30 days per plant)
    all_plants = await db.plants.find({"tenant_id": sbf}, {"_id": 0}).to_list(50)
    rate_inr_per_kwh = 9.4
    for p in all_plants:
        seed_rng = random.Random(sum(ord(c) for c in p["code"]))
        base_load = 4500 + seed_rng.random() * 3000
        for d in range(30):
            day = (now - timedelta(days=d)).date().isoformat()
            kwh = round(base_load + seed_rng.random() * 800 - (200 if d % 7 in (5, 6) else 0), 1)
            pf = round(0.85 + seed_rng.random() * 0.13, 3)
            thd = round(2.0 + seed_rng.random() * 3.5, 2)
            peak_kw = round(kwh / 22 + seed_rng.random() * 40, 1)
            await db.energy_records.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": sbf, "plant_id": p["id"], "plant_name": p["name"],
                "date": day, "kwh": kwh, "cost_inr": round(kwh * rate_inr_per_kwh, 0), "peak_kw": peak_kw,
                "power_factor": pf, "thd": thd, "renewable_pct": round(8 + seed_rng.random() * 22, 1),
                "carbon_kg": round(kwh * 0.82, 1),
            })
    print(f"  Seeded 30 days of energy records for {len(all_plants)} plants")

    # 12. Production log entries (so OEE has real numbers)
    op = await db.users.find_one({"email": "operator@sbforgtech.com"}, {"_id": 0})
    cnc = await db.assets.find_one({"asset_code": "CNC-DEMO-01"}, {"_id": 0})
    if op and cnc:
        count = 0
        for d in range(7):
            for _ in range(random.randint(2, 4)):
                produced = random.randint(60, 120)
                good = int(produced * random.uniform(0.9, 0.98))
                ts = (now - timedelta(days=d, hours=random.randint(0, 23))).isoformat()
                await db.production_log.insert_one({
                    "id": str(uuid.uuid4()), "tenant_id": sbf, "asset_id": cnc["id"],
                    "asset_code": cnc["asset_code"], "operator_id": op["id"], "operator_name": op["name"],
                    "produced": produced, "good": good, "reject": produced - good, "ts": ts,
                })
                count += 1
        print(f"  Seeded {count} production log entries")
    else:
        print("  Skipped production log (operator user or CNC-DEMO-01 not found — "
              "run seed_demo_users.py first)")

    # 13. Maintenance history
    m_types = ["PREVENTIVE", "CORRECTIVE", "PREDICTIVE"]
    m_desc = {
        "PREVENTIVE": ["Oil change", "Filter replacement", "Belt inspection", "Lubrication", "Bolt torque check"],
        "CORRECTIVE": ["Bearing replaced", "Motor rewinding", "Sensor replaced", "Coupling repair"],
        "PREDICTIVE": ["Vibration diagnostics", "Thermal imaging", "Oil analysis"],
    }
    techs = ["A. Sharma", "R. Iyer", "M. Patil", "S. Khan", "N. Deshmukh"]
    m_count = 0
    for a in all_assets[:20]:
        n = random.randint(2, 5)
        for _ in range(n):
            mtype = random.choice(m_types)
            performed = now - timedelta(days=random.randint(2, 180))
            next_due = performed + timedelta(days=random.randint(30, 120))
            cost = random.randint(1500, 22000)
            await db.maintenance_records.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": sbf, "asset_id": a["id"], "asset_code": a["asset_code"],
                "type": mtype, "description": random.choice(m_desc[mtype]), "technician": random.choice(techs),
                "cost_inr": cost, "performed_at": performed.isoformat(), "next_due_at": next_due.isoformat(),
            })
            m_count += 1
    print(f"  Seeded {m_count} maintenance records")

    print("\nSimulation data seeding complete.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())