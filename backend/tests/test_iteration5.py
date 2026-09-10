"""Iteration 5 — APM restructure & reliability metrics backend tests."""
import os
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()).rstrip("/")

TA_CREDS = {"tenant_code": "SBF", "email": "tenantadmin@sbforgtech.com", "password": "Admin@123"}
OP_CREDS = {"tenant_code": "SBF", "email": "operator@sbforgtech.com", "password": "Operator@123"}


def _read_ingest_key():
    for line in open("/app/backend/.env").read().splitlines():
        if line.startswith("INGEST_KEY"):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


INGEST_KEY = _read_ingest_key()


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def ta_headers():
    return {"Authorization": f"Bearer {_login(TA_CREDS)}"}


@pytest.fixture(scope="session")
def op_headers():
    return {"Authorization": f"Bearer {_login(OP_CREDS)}"}


@pytest.fixture(scope="session")
def cnc_asset(ta_headers):
    lst = requests.get(f"{BASE_URL}/api/assets", headers=ta_headers, timeout=30).json()
    return next(a for a in lst if a["asset_code"] == "CNC-DEMO-01")


# ---------- metrics ----------
def test_asset_metrics_keys(ta_headers, cnc_asset):
    r = requests.get(f"{BASE_URL}/api/assets/{cnc_asset['id']}/metrics", headers=ta_headers, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    required = {"asset_id", "asset_code", "name", "asset_type", "status", "health",
                "runtime_hours", "failure_count", "mtbf_hours", "mttr_hours",
                "downtime_min_total", "downtime_events",
                "maintenance_count", "maintenance_cost_ytd",
                "last_maintenance", "next_maintenance"}
    missing = required - set(d.keys())
    assert not missing, f"missing keys: {missing}"
    assert isinstance(d["mtbf_hours"], (int, float)) and d["mtbf_hours"] >= 0
    assert isinstance(d["mttr_hours"], (int, float)) and d["mttr_hours"] >= 0
    assert d["maintenance_count"] >= 2, f"expected >=2 maintenance records for CNC-DEMO-01, got {d['maintenance_count']}"


def test_metrics_module_gate(ta_headers, cnc_asset):
    # disable APM
    r = requests.put(f"{BASE_URL}/api/modules/APM", headers=ta_headers,
                     json={"enabled": False}, timeout=15)
    assert r.status_code == 200, r.text
    try:
        r = requests.get(f"{BASE_URL}/api/assets/{cnc_asset['id']}/metrics",
                         headers=ta_headers, timeout=15)
        assert r.status_code == 403
    finally:
        r = requests.put(f"{BASE_URL}/api/modules/APM", headers=ta_headers,
                         json={"enabled": True}, timeout=15)
        assert r.status_code == 200


# ---------- maintenance list & create ----------
def test_maintenance_list_structure(ta_headers, cnc_asset):
    r = requests.get(f"{BASE_URL}/api/assets/{cnc_asset['id']}/maintenance",
                     headers=ta_headers, timeout=30)
    assert r.status_code == 200
    lst = r.json()
    assert isinstance(lst, list) and lst
    for rec in lst:
        assert rec["type"] in {"PREVENTIVE", "CORRECTIVE", "PREDICTIVE"}
        for k in ["description", "cost_inr", "performed_at"]:
            assert k in rec
        assert "next_due_at" in rec  # may be null but key present


def test_maintenance_create_and_appears(ta_headers, cnc_asset):
    marker = f"TEST_LOG_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE_URL}/api/assets/{cnc_asset['id']}/maintenance",
                      headers=ta_headers,
                      json={"type": "PREVENTIVE", "description": marker, "cost_inr": 1234},
                      timeout=30)
    assert r.status_code in (200, 201), r.text
    d = r.json()
    assert "id" in d
    assert d["description"] == marker
    # subsequent GET returns it at the top (records are sorted by performed_at desc)
    lst = requests.get(f"{BASE_URL}/api/assets/{cnc_asset['id']}/maintenance",
                       headers=ta_headers, timeout=30).json()
    assert lst[0]["description"] == marker


def test_maintenance_create_forbidden_for_operator(op_headers, cnc_asset):
    r = requests.post(f"{BASE_URL}/api/assets/{cnc_asset['id']}/maintenance",
                      headers=op_headers,
                      json={"type": "PREVENTIVE", "description": "nope", "cost_inr": 1},
                      timeout=15)
    assert r.status_code == 403


def test_maintenance_create_bad_type(ta_headers, cnc_asset):
    r = requests.post(f"{BASE_URL}/api/assets/{cnc_asset['id']}/maintenance",
                      headers=ta_headers,
                      json={"type": "BAD", "description": "x", "cost_inr": 0},
                      timeout=15)
    assert r.status_code == 400


def test_maintenance_create_audit_log(ta_headers, cnc_asset):
    marker = f"AUDIT_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE_URL}/api/assets/{cnc_asset['id']}/maintenance",
                      headers=ta_headers,
                      json={"type": "CORRECTIVE", "description": marker, "cost_inr": 500},
                      timeout=15)
    assert r.status_code in (200, 201)
    logs = requests.get(f"{BASE_URL}/api/audit-logs?action=maintenance.create",
                        headers=ta_headers, timeout=15)
    assert logs.status_code == 200
    entries = logs.json()
    # Should have at least one entry for this asset
    assert any(e.get("entity_id") == cnc_asset["id"] for e in entries), \
        f"no maintenance.create audit for asset (found {len(entries)} entries)"


# ---------- compare ----------
def test_compare_three_assets(ta_headers):
    lst = requests.get(f"{BASE_URL}/api/assets", headers=ta_headers, timeout=15).json()
    ids = [a["id"] for a in lst[:3]]
    r = requests.get(f"{BASE_URL}/api/apm/compare?ids={','.join(ids)}",
                     headers=ta_headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list) and len(data) == 3
    for item in data:
        for k in ["asset_id", "runtime_hours", "mtbf_hours", "mttr_hours",
                  "maintenance_count", "history", "location"]:
            assert k in item
        assert isinstance(item["history"], list)
        # inspect a history point if present
        if item["history"]:
            hp = item["history"][0]
            for hk in ["ts", "temperature", "vibration", "rpm", "power"]:
                assert hk in hp


def test_compare_too_many(ta_headers):
    lst = requests.get(f"{BASE_URL}/api/assets", headers=ta_headers, timeout=15).json()
    ids = [a["id"] for a in lst[:5]]
    r = requests.get(f"{BASE_URL}/api/apm/compare?ids={','.join(ids)}",
                     headers=ta_headers, timeout=15)
    assert r.status_code == 400


def test_compare_no_ids(ta_headers):
    r = requests.get(f"{BASE_URL}/api/apm/compare", headers=ta_headers, timeout=15)
    assert r.status_code in (400, 422)


def test_compare_module_gate(ta_headers, cnc_asset):
    r = requests.put(f"{BASE_URL}/api/modules/APM", headers=ta_headers,
                     json={"enabled": False}, timeout=15)
    assert r.status_code == 200
    try:
        r = requests.get(f"{BASE_URL}/api/apm/compare?ids={cnc_asset['id']}",
                         headers=ta_headers, timeout=15)
        assert r.status_code == 403
    finally:
        requests.put(f"{BASE_URL}/api/modules/APM", headers=ta_headers,
                     json={"enabled": True}, timeout=15)


# ---------- location field ----------
def test_asset_get_has_location(ta_headers, cnc_asset):
    r = requests.get(f"{BASE_URL}/api/assets/{cnc_asset['id']}",
                     headers=ta_headers, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d.get("location") == "Pune, MH · Forging Area · Bay 1", f"unexpected location: {d.get('location')}"


def test_asset_location_pune_pattern(ta_headers):
    lst = requests.get(f"{BASE_URL}/api/assets", headers=ta_headers, timeout=15).json()
    # Find Pune assets (via detail fetch for location)
    checked = 0
    for a in lst:
        d = requests.get(f"{BASE_URL}/api/assets/{a['id']}", headers=ta_headers, timeout=15).json()
        if d.get("plant_name") == "Pune Plant":
            loc = d.get("location") or ""
            assert loc.startswith("Pune, MH"), f"Pune asset {d['asset_code']} location={loc!r}"
            assert "Bay" in loc
            checked += 1
            if checked >= 5:
                break
    assert checked >= 1


def test_create_asset_preserves_location(ta_headers):
    plants = requests.get(f"{BASE_URL}/api/plants", headers=ta_headers, timeout=15).json()
    areas = requests.get(f"{BASE_URL}/api/areas", headers=ta_headers, timeout=15).json()
    code = f"TEST-LOC-{uuid.uuid4().hex[:5].upper()}"
    loc = "TEST City · Test Bay · Bay 9"
    payload = {"asset_code": code, "name": "TEST Loc", "asset_type": "CNC Machine",
               "plant_id": plants[0]["id"], "area_id": areas[0]["id"], "location": loc}
    r = requests.post(f"{BASE_URL}/api/assets", headers=ta_headers, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    got = requests.get(f"{BASE_URL}/api/assets/{aid}", headers=ta_headers, timeout=15).json()
    assert got.get("location") == loc


# ---------- flow telemetry ----------
def test_telemetry_flow_ingest(ta_headers, cnc_asset):
    assert INGEST_KEY, "INGEST_KEY missing"
    r = requests.post(f"{BASE_URL}/api/telemetry/ingest",
                      headers={"X-Ingest-Key": INGEST_KEY},
                      json={"asset_code": "CNC-DEMO-01", "flow": 45.6,
                            "machine_status": "RUNNING", "temperature": 65},
                      timeout=15)
    assert r.status_code == 200, r.text
    latest = requests.get(f"{BASE_URL}/api/assets/{cnc_asset['id']}/telemetry/latest",
                          headers=ta_headers, timeout=15).json()
    assert latest.get("flow") == 45.6
