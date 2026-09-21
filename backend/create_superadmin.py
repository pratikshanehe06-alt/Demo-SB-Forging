"""
One-off script to create (or fix) ALL the demo accounts shown on the
CoreOT login screen, without wiping any existing MongoDB data.

Creates/updates:
  - Tenants: PLATFORM, SBF (SB Forgtech Pvt Ltd), ABC
  - Users:
      superadmin@coreot.com          (PLATFORM_SUPER_ADMIN, tenant: PLATFORM)
      tenantadmin@sbforgtech.com     (TENANT_ADMIN,        tenant: SBF)
      cxo@sbforgtech.com             (CXO,                 tenant: SBF)
      production@sbforgtech.com      (PRODUCTION_MANAGER,  tenant: SBF)
      supervisor@sbforgtech.com      (SUPERVISOR,          tenant: SBF)
      operator@sbforgtech.com        (OPERATOR,            tenant: SBF)

Usage:
    cd backend
    python seed_demo_users.py

Run this from inside your `backend/` folder so it picks up the same
.env file (MONGO_URL, DB_NAME) that your server uses.

Safe to run multiple times — it upserts (creates if missing, resets
password + role if the user already exists) instead of duplicating.
"""

import asyncio
import os
import uuid
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---- Tenants shown / implied on the login screen ----
TENANTS_SEED: List[Dict[str, str]] = [
    {"code": "PLATFORM", "name": "CoreOT Platform"},
    {"code": "SBF", "name": "SB Forgtech Pvt Ltd"},
    {"code": "ABC", "name": "ABC Manufacturing Pvt Ltd"},
]

# ---- Demo accounts shown on the login screen ----
USERS_SEED: List[Dict[str, str]] = [
    {
        "email": "superadmin@coreot.com",
        "name": "Platform Admin",
        "role": "PLATFORM_SUPER_ADMIN",
        "password": "Super@123",
        "tenant_code": "PLATFORM",
        "employee_id": "SA-001",
    },
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


async def ensure_tenant(db, code: str, name: str) -> str:
    existing = await db.tenants.find_one({"code": code})
    if existing:
        print(f"  Tenant '{code}' already exists ({existing['id']})")
        return existing["id"]
    tid = str(uuid.uuid4())
    await db.tenants.insert_one({"id": tid, "code": code, "name": name})
    print(f"  Created tenant '{code}' -> {name} ({tid})")
    return tid


async def ensure_user(db, u: Dict[str, str], tenant_id: str) -> None:
    hashed_pw = pwd_context.hash(u["password"])
    existing = await db.users.find_one({"email": u["email"]})
    if existing:
        await db.users.update_one(
            {"email": u["email"]},
            {"$set": {
                "password": hashed_pw,
                "role": u["role"],
                "name": u["name"],
                "employee_id": u["employee_id"],
                "tenant_id": tenant_id,
                "active": True,
            }},
        )
        print(f"  Updated user '{u['email']}' -> role={u['role']}, password reset")
    else:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "email": u["email"],
            "name": u["name"],
            "role": u["role"],
            "employee_id": u["employee_id"],
            "plants": [],
            "active": True,
            "assigned_asset_id": None,
            "password": hashed_pw,
        })
        print(f"  Created user '{u['email']}' -> role={u['role']}")


async def main() -> None:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    print("Ensuring tenants...")
    tenant_ids: Dict[str, str] = {}
    for t in TENANTS_SEED:
        tenant_ids[t["code"]] = await ensure_tenant(db, t["code"], t["name"])

    print("\nEnsuring demo users...")
    for u in USERS_SEED:
        await ensure_user(db, u, tenant_ids[u["tenant_code"]])

    print("\nDone. Demo accounts (tenant / email / password):\n")
    for u in USERS_SEED:
        print(f"  [{u['tenant_code']:<8}] {u['email']:<30} {u['password']}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())