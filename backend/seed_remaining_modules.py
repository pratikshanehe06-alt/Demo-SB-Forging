"""
One-off script to seed demo data for the four remaining modules:
Smart Inventory, TQC (Traceability/Quality/Carbon), Digital Workforce,
and Financial Intelligence.

Usage:
    cd backend
    python seed_remaining_modules.py --tenant-code SBF
    python seed_remaining_modules.py --tenant-code SBF --force
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

INVENTORY_ITEMS = [
    ("SPARES", "Bearing Set 6205", "PCS", 8),
    ("SPARES", "Hydraulic Seal Kit", "PCS", 12),
    ("SPARES", "Motor Contactor 40A", "PCS", 5),
    ("CONSUMABLES", "Welding Rod 3.2mm", "KG", 40),
    ("CONSUMABLES", "Cutting Oil", "L", 60),
    ("CONSUMABLES", "Grease NLGI-2", "KG", 25),
    ("RAW_MATERIAL", "Mild Steel Billet", "TON", 6),
    ("RAW_MATERIAL", "Alloy Steel Rod", "TON", 4),
    ("TOOLS", "Torque Wrench Set", "PCS", 3),
    ("TOOLS", "Digital Caliper", "PCS", 6),
]

PRODUCTS = ["Forged Flange 100mm", "Forged Flange 150mm", "Shaft Coupling", "Hex Bolt M20"]

SHIFT_TEMPLATES = [("Shift A (06:00-14:00)", 25), ("Shift B (14:00-22:00)", 22), ("Shift C (22:00-06:00)", 15)]
ROLES = ["Operator", "Technician", "Supervisor", "Quality Inspector", "Fitter"]


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

    existing = await db.inventory_items.count_documents({"tenant_id": tid})
    if existing > 0 and not args.force:
        print("Already seeded. Use --force to add more.")
        client.close()
        return

    plants = await db.plants.find({"tenant_id": tid}, {"_id": 0}).to_list(50)
    if not plants:
        raise RuntimeError("No plants found. Seed plants first.")

    now = datetime.now(timezone.utc)
    counts = {"inv_items": 0, "inv_moves": 0, "batches": 0, "carbon": 0, "shifts": 0, "logs": 0, "financial": 0}

    for plant in plants:
        # ---- Smart Inventory ----
        for i, (cat, name, uom, base_qty) in enumerate(INVENTORY_ITEMS):
            iid = str(uuid.uuid4())
            reorder = base_qty * 0.4
            max_stock = base_qty * 2
            qty = round(random.uniform(reorder * 0.5, max_stock), 1)
            status = "CRITICAL" if qty < reorder * 0.5 else "LOW" if qty < reorder else "OVERSTOCK" if qty > max_stock * 0.9 else "OK"
            await db.inventory_items.insert_one({
                "id": iid, "tenant_id": tid, "plant_id": plant["id"],
                "sku": f"{cat[:3]}-{i+1:03d}", "name": name, "category": cat, "uom": uom,
                "qty_on_hand": qty, "reorder_point": reorder, "max_stock": max_stock,
                "unit_cost": round(random.uniform(50, 5000), 0), "location": f"Rack {random.randint(1,20)}",
                "status": status,
            })
            counts["inv_items"] += 1
            for _ in range(random.randint(1, 3)):
                mtype = random.choice(["RECEIPT", "ISSUE", "TRANSFER"])
                await db.inventory_movements.insert_one({
                    "id": str(uuid.uuid4()), "tenant_id": tid, "plant_id": plant["id"], "item_id": iid,
                    "sku": f"{cat[:3]}-{i+1:03d}", "type": mtype,
                    "qty": round(random.uniform(1, base_qty * 0.3), 1),
                    "ts": (now - timedelta(days=random.randint(0, 14))).isoformat(),
                    "reference": f"WO-{random.randint(1000,9999)}" if mtype == "ISSUE" else f"PO-{random.randint(1000,9999)}",
                })
                counts["inv_moves"] += 1

        # ---- TQC: quality batches (14 days) ----
        for d in range(14):
            for _ in range(random.randint(1, 3)):
                produced = random.randint(80, 300)
                defect_rate = round(random.uniform(0.5, 6.0), 2)
                reject = int(produced * defect_rate / 100)
                good = produced - reject
                status = "FAIL" if defect_rate > 5 else "HOLD" if defect_rate > 3 else "PASS"
                await db.quality_batches.insert_one({
                    "id": str(uuid.uuid4()), "tenant_id": tid, "plant_id": plant["id"],
                    "batch_no": f"B{now.strftime('%y%m')}-{random.randint(1000,9999)}",
                    "product": random.choice(PRODUCTS), "produced_qty": produced,
                    "good_qty": good, "reject_qty": reject, "defect_rate_pct": defect_rate,
                    "status": status, "produced_at": (now - timedelta(days=d, hours=random.randint(0,23))).isoformat(),
                    "traceability": {
                        "raw_material_lot": f"RM-{random.randint(100,999)}",
                        "operator": random.choice(["A. Sharma", "R. Iyer", "M. Patil"]),
                        "line": random.choice(["Forge Line 1", "Forge Line 2"]),
                    },
                })
                counts["batches"] += 1

        # ---- TQC: carbon records (30 days) ----
        base_carbon = random.uniform(800, 1500)
        for d in range(30):
            scope1 = round(base_carbon * random.uniform(0.4, 0.5), 1)
            scope2 = round(base_carbon * random.uniform(0.3, 0.4), 1)
            scope3 = round(base_carbon * random.uniform(0.15, 0.25), 1)
            await db.carbon_records.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": tid, "plant_id": plant["id"],
                "date": (now - timedelta(days=d)).date().isoformat(),
                "scope1_kg": scope1, "scope2_kg": scope2, "scope3_kg": scope3,
                "total_kg": round(scope1 + scope2 + scope3, 1),
                "intensity_per_unit": round(random.uniform(2.0, 5.0), 2),
            })
            counts["carbon"] += 1

        # ---- Digital Workforce ----
        shift_ids = []
        for name, headcount in SHIFT_TEMPLATES:
            sid = str(uuid.uuid4())
            shift_ids.append((sid, name))
            present = max(0, headcount - random.randint(0, 4))
            await db.workforce_shifts.insert_one({
                "id": sid, "tenant_id": tid, "plant_id": plant["id"], "name": name,
                "start_time": name.split("(")[1].split("-")[0], "end_time": name.split("-")[1].rstrip(")"),
                "headcount_planned": headcount, "headcount_present": present,
            })
            counts["shifts"] += 1
        for _ in range(10):
            sid, sname = random.choice(shift_ids)
            clock_in = now - timedelta(hours=random.randint(1, 20))
            await db.workforce_logs.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": tid, "plant_id": plant["id"],
                "employee_name": random.choice(["S. Patil", "N. Deshmukh", "K. Rao", "V. Shah", "P. Menon"]),
                "role": random.choice(ROLES), "shift_id": sid, "shift_name": sname,
                "clock_in": clock_in.isoformat(),
                "clock_out": (clock_in + timedelta(hours=8)).isoformat(),
                "productivity_score": round(random.uniform(70, 98), 1),
            })
            counts["logs"] += 1

        # ---- Financial Intelligence (6 months) ----
        for m in range(6):
            month = (now - timedelta(days=30 * m)).strftime("%Y-%m")
            revenue = round(random.uniform(8_000_000, 15_000_000), 0)
            labor = round(revenue * random.uniform(0.15, 0.2), 0)
            material = round(revenue * random.uniform(0.35, 0.45), 0)
            energy = round(revenue * random.uniform(0.06, 0.1), 0)
            maintenance = round(revenue * random.uniform(0.03, 0.06), 0)
            overhead = round(revenue * random.uniform(0.08, 0.12), 0)
            cost = labor + material + energy + maintenance + overhead
            await db.financial_records.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": tid, "plant_id": plant["id"], "month": month,
                "revenue_inr": revenue, "cost_inr": cost,
                "margin_pct": round((revenue - cost) * 100 / revenue, 1),
                "category_breakdown": {"labor": labor, "material": material, "energy": energy,
                                        "maintenance": maintenance, "overhead": overhead},
            })
            counts["financial"] += 1

    print(f"Seeded across {len(plants)} plant(s): "
          f"{counts['inv_items']} inventory items, {counts['inv_moves']} movements, "
          f"{counts['batches']} quality batches, {counts['carbon']} carbon records, "
          f"{counts['shifts']} shifts, {counts['logs']} workforce logs, "
          f"{counts['financial']} financial records.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
