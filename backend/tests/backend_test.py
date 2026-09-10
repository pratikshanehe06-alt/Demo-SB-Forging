"""CoreOT APM backend tests."""
import asyncio
import json
import os
import time
import uuid

import pytest
import requests
import websockets

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()
BASE_URL = BASE_URL.rstrip("/")
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")

CREDS = {"tenant_code": "SBF", "email": "tenantadmin@sbforgtech.com", "password": "Admin@123"}


@pytest.fixture(scope="session")
def token_and_user():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=CREDS, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def token(token_and_user):
    return token_and_user["access_token"]


@pytest.fixture(scope="session")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Health ----------
def test_root_ok():
    r = requests.get(f"{BASE_URL}/api/", timeout=15)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---------- Auth ----------
def test_login_success(token_and_user):
    d = token_and_user
    assert d["user"]["role"] == "TENANT_ADMIN"
    assert d["tenant"]["name"] == "SB Forgtech Pvt Ltd"
    assert d["access_token"]


def test_login_wrong_tenant():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={**CREDS, "tenant_code": "XXX"}, timeout=15)
    assert r.status_code == 401


def test_login_wrong_password():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={**CREDS, "password": "wrong"}, timeout=15)
    assert r.status_code == 401


def test_me_ok(headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=15)
    assert r.status_code == 200
    assert r.json()["email"] == CREDS["email"]


def test_me_no_token():
    r = requests.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert r.status_code == 401


# ---------- Dashboard ----------
def test_dashboard_summary(headers):
    r = requests.get(f"{BASE_URL}/api/dashboard/summary", headers=headers, timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ["total_assets", "running", "idle", "fault", "offline", "active_alarms", "critical_alarms"]:
        assert k in d["kpis"]
    assert d["kpis"]["total_assets"] == 45
    for k in ["healthy", "warning", "critical", "offline", "average"]:
        assert k in d["health_overview"]
    assert len(d["alarms_trend"]) == 7
    assert isinstance(d["assets_by_area"], list) and d["assets_by_area"]
    assert isinstance(d["recent_alarms"], list)
    assert isinstance(d["top_faulty_assets"], list)


# ---------- Assets ----------
def test_list_assets(headers):
    r = requests.get(f"{BASE_URL}/api/assets", headers=headers, timeout=15)
    assert r.status_code == 200
    lst = r.json()
    assert len(lst) == 45
    a = lst[0]
    for k in ["asset_code", "name", "asset_type", "area_name", "status", "health"]:
        assert k in a


def test_list_assets_filter_status(headers):
    r = requests.get(f"{BASE_URL}/api/assets?status=RUNNING", headers=headers, timeout=15)
    assert r.status_code == 200
    lst = r.json()
    assert lst
    assert all(a["status"] == "RUNNING" for a in lst)


def test_list_assets_filter_area(headers):
    areas = requests.get(f"{BASE_URL}/api/areas", headers=headers, timeout=15).json()
    aid = areas[0]["id"]
    r = requests.get(f"{BASE_URL}/api/assets?area_id={aid}", headers=headers, timeout=15)
    assert r.status_code == 200
    assert all(a["area_id"] == aid for a in r.json())


def test_hierarchy(headers):
    r = requests.get(f"{BASE_URL}/api/assets/hierarchy", headers=headers, timeout=15)
    assert r.status_code == 200
    tree = r.json()
    plants = [p for p in tree if p["name"] == "Pune Plant"]
    assert plants
    assert len(plants[0]["areas"]) == 4


def test_get_asset_populated(headers):
    lst = requests.get(f"{BASE_URL}/api/assets", headers=headers, timeout=15).json()
    r = requests.get(f"{BASE_URL}/api/assets/{lst[0]['id']}", headers=headers, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "area_name" in d and "plant_name" in d


def test_create_asset(headers):
    areas = requests.get(f"{BASE_URL}/api/areas", headers=headers, timeout=15).json()
    plants = requests.get(f"{BASE_URL}/api/plants", headers=headers, timeout=15).json()
    code = f"TEST-{uuid.uuid4().hex[:6].upper()}"
    payload = {"asset_code": code, "name": "TEST Machine", "asset_type": "CNC Machine",
               "plant_id": plants[0]["id"], "area_id": areas[0]["id"]}
    r = requests.post(f"{BASE_URL}/api/assets", headers=headers, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    # verify appears in list
    lst = requests.get(f"{BASE_URL}/api/assets", headers=headers, timeout=15).json()
    assert any(a["id"] == aid for a in lst)
    # cleanup
    try:
        # No DELETE endpoint - leave it (will bump asset count)
        pass
    finally:
        pytest.asset_created_id = aid


def test_update_asset(headers):
    lst = requests.get(f"{BASE_URL}/api/assets", headers=headers, timeout=15).json()
    aid = lst[0]["id"]
    r = requests.put(f"{BASE_URL}/api/assets/{aid}", headers=headers, json={"health": 50}, timeout=15)
    assert r.status_code == 200
    got = requests.get(f"{BASE_URL}/api/assets/{aid}", headers=headers, timeout=15).json()
    assert got["health"] == 50


# ---------- Alarms ----------
def test_list_alarms(headers):
    r = requests.get(f"{BASE_URL}/api/alarms", headers=headers, timeout=15)
    assert r.status_code == 200
    lst = r.json()
    assert lst
    for k in ["severity", "message", "asset_code", "created_at"]:
        assert k in lst[0]


def test_filter_alarms_critical(headers):
    r = requests.get(f"{BASE_URL}/api/alarms?severity=CRITICAL", headers=headers, timeout=15)
    assert r.status_code == 200
    assert all(a["severity"] == "CRITICAL" for a in r.json())


def test_acknowledge_alarm(headers):
    lst = requests.get(f"{BASE_URL}/api/alarms", headers=headers, timeout=15).json()
    aid = lst[0]["id"]
    r = requests.post(f"{BASE_URL}/api/alarms/{aid}/acknowledge", headers=headers, timeout=15)
    assert r.status_code == 200
    lst2 = requests.get(f"{BASE_URL}/api/alarms", headers=headers, timeout=15).json()
    got = [a for a in lst2 if a["id"] == aid][0]
    assert got["acknowledged"] is True


# ---------- Areas / Plants ----------
def test_areas(headers):
    r = requests.get(f"{BASE_URL}/api/areas", headers=headers, timeout=15)
    assert r.status_code == 200
    names = {a["name"] for a in r.json()}
    assert {"Forging Area", "Heat Treatment", "Utilities", "Storage"}.issubset(names)


def test_plants(headers):
    r = requests.get(f"{BASE_URL}/api/plants", headers=headers, timeout=15)
    assert r.status_code == 200
    assert any(p["name"] == "Pune Plant" for p in r.json())


# ---------- Telemetry ingest ----------
def test_ingest_warning(headers):
    r = requests.post(f"{BASE_URL}/api/telemetry/ingest",
                      json={"asset_code": "CNC-DEMO-01", "temperature": 95, "rpm": 1500, "power": 10.5},
                      timeout=15)
    assert r.status_code == 200
    assert r.json()["ok"] is True
    # verify asset status updated
    lst = requests.get(f"{BASE_URL}/api/assets", headers=headers, timeout=15).json()
    cnc = [a for a in lst if a["asset_code"] == "CNC-DEMO-01"][0]
    assert cnc["status"] == "WARNING"


def test_ingest_critical():
    r = requests.post(f"{BASE_URL}/api/telemetry/ingest",
                      json={"asset_code": "CNC-DEMO-01", "temperature": 105}, timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "CRITICAL"


def test_ingest_alarm_creates_entry(headers):
    msg = f"TEST_ALARM_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE_URL}/api/telemetry/ingest",
                      json={"asset_code": "CNC-DEMO-01", "alarm": True, "alarm_message": msg},
                      timeout=15)
    assert r.status_code == 200
    alarms = requests.get(f"{BASE_URL}/api/alarms", headers=headers, timeout=15).json()
    assert any(a["message"] == msg for a in alarms)


def test_ingest_stopped(headers):
    r = requests.post(f"{BASE_URL}/api/telemetry/ingest",
                      json={"asset_code": "CNC-DEMO-01", "machine_status": "STOPPED"}, timeout=15)
    assert r.status_code == 200
    lst = requests.get(f"{BASE_URL}/api/assets", headers=headers, timeout=15).json()
    cnc = [a for a in lst if a["asset_code"] == "CNC-DEMO-01"][0]
    assert cnc["status"] == "STOPPED"
    # restore to RUNNING for later tests / simulator
    requests.post(f"{BASE_URL}/api/telemetry/ingest",
                  json={"asset_code": "CNC-DEMO-01", "machine_status": "RUNNING", "temperature": 62},
                  timeout=15)


def test_telemetry_latest_and_history(headers):
    lst = requests.get(f"{BASE_URL}/api/assets", headers=headers, timeout=15).json()
    cnc = [a for a in lst if a["asset_code"] == "CNC-DEMO-01"][0]
    r = requests.get(f"{BASE_URL}/api/assets/{cnc['id']}/telemetry/latest", headers=headers, timeout=15)
    assert r.status_code == 200
    assert r.json()
    r2 = requests.get(f"{BASE_URL}/api/assets/{cnc['id']}/telemetry/history", headers=headers, timeout=15)
    assert r2.status_code == 200
    assert isinstance(r2.json(), list) and r2.json()


# ---------- WebSocket ----------
def test_ws_requires_token():
    async def run():
        try:
            async with websockets.connect(f"{WS_BASE}/api/ws/telemetry") as _:
                pass
            return None
        except Exception as e:
            return e
    exc = asyncio.get_event_loop().run_until_complete(run()) if False else asyncio.new_event_loop().run_until_complete(run())
    assert exc is not None  # should fail to open (closed with 4401)


def test_ws_broadcast_on_ingest(token):
    async def run():
        url = f"{WS_BASE}/api/ws/telemetry?token={token}"
        async with websockets.connect(url) as ws:
            # trigger ingest
            requests.post(f"{BASE_URL}/api/telemetry/ingest",
                          json={"asset_code": "CNC-DEMO-01", "temperature": 70,
                                "machine_status": "RUNNING"}, timeout=10)
            # wait up to ~10s for a telemetry message
            deadline = time.time() + 12
            while time.time() < deadline:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=6)
                    data = json.loads(msg)
                    if data.get("type") == "telemetry":
                        return data
                except asyncio.TimeoutError:
                    break
        return None
    data = asyncio.new_event_loop().run_until_complete(run())
    assert data is not None
    assert data["type"] == "telemetry"
