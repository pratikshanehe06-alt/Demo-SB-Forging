"""Iteration 6 — Per-asset alarm Threshold Editor + Downtime root-cause chart."""
import os
import time
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()).rstrip("/")

TA_CREDS = {"tenant_code": "SBF", "email": "tenantadmin@sbforgtech.com", "password": "Admin@123"}
PM_CREDS = {"tenant_code": "SBF", "email": "production@sbforgtech.com", "password": "Prod@123"}
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
def pm_headers():
    return {"Authorization": f"Bearer {_login(PM_CREDS)}"}


@pytest.fixture(scope="session")
def op_headers():
    return {"Authorization": f"Bearer {_login(OP_CREDS)}"}


@pytest.fixture(scope="session")
def cnc_asset(ta_headers):
    lst = requests.get(f"{BASE_URL}/api/assets", headers=ta_headers, timeout=30).json()
    return next(a for a in lst if a["asset_code"] == "CNC-DEMO-01")


def _reset_thresholds(ta_headers, asset_id):
    requests.put(f"{BASE_URL}/api/assets/{asset_id}/thresholds", json={},
                 headers=ta_headers, timeout=30)


# ---------- GET thresholds ----------
def test_get_thresholds_defaults(ta_headers, cnc_asset):
    _reset_thresholds(ta_headers, cnc_asset["id"])
    r = requests.get(f"{BASE_URL}/api/assets/{cnc_asset['id']}/thresholds",
                     headers=ta_headers, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["defaults"]["temperature"] == {"warning": 85.0, "critical": 100.0}
    assert d["defaults"]["vibration"] == {"warning": 8.0, "critical": 12.0}
    assert d["thresholds"] == {}


# ---------- PUT thresholds ----------
def test_put_thresholds_pm_ok(pm_headers, ta_headers, cnc_asset):
    payload = {"temperature": {"warning": 70, "critical": 90},
               "vibration": {"warning": 5, "critical": 9}}
    r = requests.put(f"{BASE_URL}/api/assets/{cnc_asset['id']}/thresholds",
                     json=payload, headers=pm_headers, timeout=30)
    assert r.status_code == 200, r.text
    saved = r.json()["thresholds"]
    assert saved["temperature"] == {"warning": 70.0, "critical": 90.0}
    assert saved["vibration"] == {"warning": 5.0, "critical": 9.0}
    # GET verifies persistence
    g = requests.get(f"{BASE_URL}/api/assets/{cnc_asset['id']}/thresholds",
                     headers=ta_headers, timeout=30).json()
    assert g["thresholds"]["temperature"]["warning"] == 70.0
    assert g["thresholds"]["temperature"]["critical"] == 90.0
    assert g["thresholds"]["vibration"]["warning"] == 5.0
    assert g["thresholds"]["vibration"]["critical"] == 9.0
    _reset_thresholds(ta_headers, cnc_asset["id"])


def test_put_thresholds_operator_forbidden(op_headers, cnc_asset):
    r = requests.put(f"{BASE_URL}/api/assets/{cnc_asset['id']}/thresholds",
                     json={"temperature": {"warning": 70, "critical": 90}},
                     headers=op_headers, timeout=30)
    assert r.status_code == 403, r.text


@pytest.mark.parametrize("payload", [
    {"temperature": {"warning": 100, "critical": 80}},
    {"vibration": {"warning": 10, "critical": 5}},
    {"temperature": {"warning": 100, "critical": 80}, "vibration": {"warning": 10, "critical": 5}},
])
def test_put_thresholds_bad_bands_400(pm_headers, cnc_asset, payload):
    r = requests.put(f"{BASE_URL}/api/assets/{cnc_asset['id']}/thresholds",
                     json=payload, headers=pm_headers, timeout=30)
    assert r.status_code == 400, r.text


# ---------- Threshold-aware ingest ----------
def _ingest(temperature=None, vibration=None, asset_code="CNC-DEMO-01",
            machine_status="RUNNING"):
    payload = {"asset_code": asset_code, "machine_status": machine_status}
    if temperature is not None:
        payload["temperature"] = temperature
    if vibration is not None:
        payload["vibration"] = vibration
    r = requests.post(f"{BASE_URL}/api/telemetry/ingest",
                      json=payload,
                      headers={"X-Ingest-Key": INGEST_KEY}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _get_asset_status(ta_headers, asset_id):
    r = requests.get(f"{BASE_URL}/api/assets/{asset_id}", headers=ta_headers, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["status"]


def test_ingest_temperature_uses_asset_thresholds(pm_headers, ta_headers, cnc_asset):
    aid = cnc_asset["id"]
    # Set thresholds warn=70, crit=90
    r = requests.put(f"{BASE_URL}/api/assets/{aid}/thresholds",
                     json={"temperature": {"warning": 70, "critical": 90}},
                     headers=pm_headers, timeout=30)
    assert r.status_code == 200

    try:
        # temp=75 → WARNING
        _ingest(temperature=75)
        time.sleep(0.4)
        assert _get_asset_status(ta_headers, aid) == "WARNING"

        # temp=92 → CRITICAL
        _ingest(temperature=92)
        time.sleep(0.4)
        assert _get_asset_status(ta_headers, aid) == "CRITICAL"

        # temp=60 → stays RUNNING (machine_status=RUNNING overrides prior)
        _ingest(temperature=60)
        time.sleep(0.4)
        assert _get_asset_status(ta_headers, aid) == "RUNNING"
    finally:
        _reset_thresholds(ta_headers, aid)


def test_ingest_vibration_uses_defaults_when_no_override(ta_headers, cnc_asset):
    aid = cnc_asset["id"]
    _reset_thresholds(ta_headers, aid)
    # vibration=15 → CRITICAL (default crit=12)
    _ingest(vibration=15)
    time.sleep(0.4)
    assert _get_asset_status(ta_headers, aid) == "CRITICAL"
    # vibration=9 → WARNING (8<9<12) — need to bring status back to RUNNING first
    _ingest(vibration=9)  # machine_status=RUNNING resets it, then 9>8 → WARNING
    time.sleep(0.4)
    assert _get_asset_status(ta_headers, aid) == "WARNING"
    # Cleanup: bring back to safe state
    _ingest(vibration=1, temperature=25)


# ---------- Audit log ----------
def test_put_thresholds_audit(pm_headers, ta_headers, cnc_asset):
    aid = cnc_asset["id"]
    requests.put(f"{BASE_URL}/api/assets/{aid}/thresholds",
                 json={"temperature": {"warning": 60, "critical": 80}},
                 headers=pm_headers, timeout=30)
    time.sleep(0.3)
    r = requests.get(f"{BASE_URL}/api/audit-logs",
                     headers=ta_headers, timeout=30, params={"limit": 100})
    assert r.status_code == 200, r.text
    rows = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    assert any(row.get("action") == "asset.thresholds" and row.get("entity_id") == aid for row in rows), \
        f"no audit row for asset.thresholds on {aid}. Sample: {rows[:3]}"
    _reset_thresholds(ta_headers, aid)


# ---------- Downtime breakdown ----------
def test_downtime_breakdown_shape(ta_headers, cnc_asset):
    r = requests.get(f"{BASE_URL}/api/assets/{cnc_asset['id']}/downtime-breakdown",
                     headers=ta_headers, timeout=30, params={"days": 30})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["days"] == 30
    assert "event_count" in d and "total_minutes" in d
    assert isinstance(d["breakdown"], list)
    for item in d["breakdown"]:
        assert "reason" in item and "minutes" in item


def test_downtime_breakdown_module_gate(ta_headers, cnc_asset):
    # Disable APM
    requests.put(f"{BASE_URL}/api/modules/APM", json={"enabled": False},
                 headers=ta_headers, timeout=30)
    try:
        r = requests.get(f"{BASE_URL}/api/assets/{cnc_asset['id']}/downtime-breakdown",
                         headers=ta_headers, timeout=30)
        assert r.status_code == 403, f"expected 403 when APM disabled, got {r.status_code}: {r.text}"
    finally:
        requests.put(f"{BASE_URL}/api/modules/APM", json={"enabled": True},
                     headers=ta_headers, timeout=30)


def test_downtime_breakdown_empty(ta_headers):
    # Create a fresh asset with no downtime events
    code = f"TEST-DT-{int(time.time())}"
    areas = requests.get(f"{BASE_URL}/api/areas", headers=ta_headers, timeout=30).json()
    plants = requests.get(f"{BASE_URL}/api/plants", headers=ta_headers, timeout=30).json()
    area_id = areas[0]["id"]
    plant_id = areas[0].get("plant_id") or plants[0]["id"]
    a = requests.post(f"{BASE_URL}/api/assets",
                      json={"asset_code": code, "asset_type": "CNC",
                            "name": code, "area_id": area_id, "plant_id": plant_id,
                            "location": "TEST · TEST · TEST"},
                      headers=ta_headers, timeout=30)
    assert a.status_code in (200, 201), a.text
    aid = a.json()["id"]
    r = requests.get(f"{BASE_URL}/api/assets/{aid}/downtime-breakdown",
                     headers=ta_headers, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["breakdown"] == []
    assert d["total_minutes"] == 0
    # cleanup
    requests.delete(f"{BASE_URL}/api/assets/{aid}", headers=ta_headers, timeout=30)
