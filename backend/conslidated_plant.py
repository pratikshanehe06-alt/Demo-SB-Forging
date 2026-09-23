"""
One-off script to consolidate a tenant's data down to a SINGLE plant,
deleting every other plant and everything tied to it (assets, alarms,
telemetry, maintenance, production, energy, fire assets, PQI/DERMS/UMS,
workforce, finance, quality/carbon records).

Usage:
    cd backend
    python consolidate_to_single_plant.py --tenant-code SBF
    python consolidate_to_single_plant.py --tenant-code SBF --keep-plant-code PUN-01

If --keep-plant-code is omitted, it keeps the plant with the MOST assets
(usually your "main" plant) and removes the rest.

This is destructive for the removed plants' data — there's no undo.
The script prints exactly what it's about to delete and asks for
confirmation before doing anything.
"""

import argparse
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# Collections keyed directly by plant_id
PLANT_SCOPED_COLLECTIONS = [
    "areas", "assets", "lines", "downtime_events", "energy_records",
    "fire_zones", "fire_assets", "solar_arrays", "bess_units",
    "ev_stations", "dg_sets", "ums_assets", "workforce_shifts",
    "workforce_logs", "financial_records", "quality_batches",
    "carbon_records", "safety_incidents",
]

# Collections keyed by asset_id, whose owning asset's plant we look up
ASSET_LINKED_COLLECTIONS = [
    "telemetry", "maintenance_records", "production_log", "alarms",
    "fire_asset_readings", "pqi_readings", "bess_readings",
    "solar_readings", "ums_readings",
]


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tenant-code", default="SBF")
    parser.add_argument("--keep-plant-code", default=None,
                         help="Plant code to keep, e.g. PUN-01. Defaults to the plant with the most assets.")
    parser.add_argument("--yes", action="store_true", help="Skip the confirmation prompt")
    args = parser.parse_args()

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    tenant = await db.tenants.find_one({"code": args.tenant_code.upper()})
    if not tenant:
        raise RuntimeError(f"Tenant '{args.tenant_code}' not found.")
    tid = tenant["id"]

    plants = await db.plants.find({"tenant_id": tid}, {"_id": 0}).to_list(50)
    if len(plants) <= 1:
        print(f"Tenant already has {len(plants)} plant(s). Nothing to do.")
        client.close()
        return

    if args.keep_plant_code:
        keep_plant = next((p for p in plants if p["code"] == args.keep_plant_code.upper()), None)
        if not keep_plant:
            raise RuntimeError(f"Plant code '{args.keep_plant_code}' not found among: "
                                f"{[p['code'] for p in plants]}")
    else:
        counts = []
        for p in plants:
            n = await db.assets.count_documents({"tenant_id": tid, "plant_id": p["id"]})
            counts.append((n, p))
        counts.sort(key=lambda x: -x[0])
        keep_plant = counts[0][1]

    remove_plants = [p for p in plants if p["id"] != keep_plant["id"]]
    remove_plant_ids = [p["id"] for p in remove_plants]

    remove_plant_names = ", ".join(f"{p['name']} ({p['code']})" for p in remove_plants)
    print(f"Tenant: {tenant['name']} ({args.tenant_code.upper()})")
    print(f"Keeping plant:  {keep_plant['name']} ({keep_plant['code']})")
    print(f"Removing plants: {remove_plant_names}")

    # Preview counts
    asset_ids_to_remove = [a["id"] for a in await db.assets.find(
        {"tenant_id": tid, "plant_id": {"$in": remove_plant_ids}}, {"_id": 0, "id": 1}
    ).to_list(5000)]
    # also non-APM asset collections tied by plant, for asset-id cleanup
    for coll in ("fire_assets", "solar_arrays", "bess_units", "ev_stations", "dg_sets", "ums_assets"):
        extra_ids = [d["id"] for d in await db[coll].find(
            {"tenant_id": tid, "plant_id": {"$in": remove_plant_ids}}, {"_id": 0, "id": 1}
        ).to_list(5000)]
        asset_ids_to_remove.extend(extra_ids)

    print(f"\nThis will delete {len(asset_ids_to_remove)} asset-like records and all their "
          f"child data (telemetry, alarms, maintenance, production, readings) across "
          f"{len(remove_plants)} plant(s).")

    if not args.yes:
        confirm = input("\nType 'yes' to proceed: ").strip().lower()
        if confirm != "yes":
            print("Aborted. Nothing was deleted.")
            client.close()
            return

    # 1. Delete asset-linked child records for assets belonging to removed plants
    total_child_deleted = 0
    if asset_ids_to_remove:
        for coll in ASSET_LINKED_COLLECTIONS:
            res = await db[coll].delete_many({"tenant_id": tid, "asset_id": {"$in": asset_ids_to_remove}})
            total_child_deleted += res.deleted_count

    # 2. Delete plant-scoped collections directly
    total_plant_scoped_deleted = 0
    for coll in PLANT_SCOPED_COLLECTIONS:
        res = await db[coll].delete_many({"tenant_id": tid, "plant_id": {"$in": remove_plant_ids}})
        total_plant_scoped_deleted += res.deleted_count

    # 3. Delete PQI mains (asset-like but keyed by main_id in pqi_readings, not asset_id)
    pqi_main_ids = [d["id"] for d in await db.pqi_mains.find(
        {"tenant_id": tid, "plant_id": {"$in": remove_plant_ids}}, {"_id": 0, "id": 1}
    ).to_list(500)]
    if pqi_main_ids:
        await db.pqi_readings.delete_many({"tenant_id": tid, "main_id": {"$in": pqi_main_ids}})
    pqi_res = await db.pqi_mains.delete_many({"tenant_id": tid, "plant_id": {"$in": remove_plant_ids}})

    # 4. Reassign operators/other users whose assigned_asset_id pointed at a removed asset
    await db.users.update_many(
        {"tenant_id": tid, "assigned_asset_id": {"$in": asset_ids_to_remove}},
        {"$set": {"assigned_asset_id": None}},
    )

    # 5. Finally, delete the plant documents themselves
    plants_res = await db.plants.delete_many({"tenant_id": tid, "id": {"$in": remove_plant_ids}})

    print(f"\nDone.")
    print(f"  Child records deleted (telemetry/alarms/maintenance/production/readings): {total_child_deleted}")
    print(f"  Plant-scoped records deleted (assets/areas/lines/energy/fire/etc.): {total_plant_scoped_deleted}")
    print(f"  PQI mains + readings deleted: {pqi_res.deleted_count}")
    print(f"  Plants removed: {plants_res.deleted_count}")
    print(f"\nRemaining plant: {keep_plant['name']} ({keep_plant['code']})")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())