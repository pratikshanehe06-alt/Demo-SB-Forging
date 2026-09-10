"""Iteration 3 backend tests: Modules, Users/Assign, Plant filter."""
import asyncio
import json
import os
import time

import pytest
import requests
import websockets

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()).rstrip("/")
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")

TA = {"tenant_code": "SBF", "email": "tenantadmin@sbforgtech.com", "password": "Admin@123"}
CXO = {"tenant_code": "SBF", "email": "cxo@sbforgtech.com", "password": "Cxo@123"}
SUP = {"tenant_code": "SBF", "email": "supervisor@sbforgtech.com", "password": "Super@123"}
OP = {"tenant_code": "SBF", "email": "operator@sbforgtech.com", "password": "Operator@123"}

MODULE_KEYS = {"APM", "EEMS", "DIGITAL_TWIN", "OEE_APS", "AI_COPILOT", "REPORTS", "AUDIT"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def ta_login():
    return _login(TA)


@pytest.fixture(scope="module")
def ta_headers(ta_login):
    return {"Authorization": f"Bearer {ta_login['access_token']}"}


@pytest.fixture(scope="module")
def cxo_headers():
    return {"Authorization": f"Bearer {_login(CXO)['access_token']}"}


@pytest.fixture(scope="module")
def sup_headers():
    return {"Authorization": f"Bearer {_login(SUP)['access_token']}"}


@pytest.fixture(scope="module")
def op_headers():
    return {"Authorization": f"Bearer {_login(OP)['access_token']}"}


# ---------- Login includes modules map ----------
def test_login_response_includes_modules(ta_login):
    modules = ta_login.get("modules")
    assert isinstance(modules, dict)
    assert set(modules.keys()) >= MODULE_KEYS
    # defaults
    assert modules["APM"] is True
    assert modules["DIGITAL_TWIN"] is True
    # Note: EEMS may be True if a previous test toggled it on. Just assert booleans.
    for k in MODULE_KEYS:
        assert isinstance(modules[k], bool)


# ---------- GET /api/modules ----------
def test_list_modules(ta_headers):
    r = requests.get(f"{BASE_URL}/api/modules", headers=ta_headers, timeout=15)
    assert r.status_code == 200
    lst = r.json()
    assert isinstance(lst, list) and len(lst) == 7
    keys = {m["key"] for m in lst}
    assert keys == MODULE_KEYS
    for m in lst:
        for f in ("key", "name", "description", "enabled"):
            assert f in m
        assert isinstance(m["enabled"], bool)


# ---------- PUT /api/modules/EEMS as TENANT_ADMIN ----------
def test_toggle_eems_enable(ta_headers):
    r = requests.put(f"{BASE_URL}/api/modules/EEMS", headers=ta_headers,
                     json={"enabled": True}, timeout=15)
    assert r.status_code == 200
    r2 = requests.get(f"{BASE_URL}/api/modules", headers=ta_headers, timeout=15).json()
    eems = [m for m in r2 if m["key"] == "EEMS"][0]
    assert eems["enabled"] is True


# ---------- PUT /api/modules/APM as CXO returns 403 ----------
def test_toggle_forbidden_for_cxo(cxo_headers):
    r = requests.put(f"{BASE_URL}/api/modules/APM", headers=cxo_headers,
                     json={"enabled": False}, timeout=15)
    assert r.status_code == 403


# ---------- Disabling APM blocks /api/assets ----------
def test_apm_gate_on_assets(ta_headers):
    try:
        r = requests.put(f"{BASE_URL}/api/modules/APM", headers=ta_headers,
                         json={"enabled": False}, timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/assets", headers=ta_headers, timeout=15)
        assert r2.status_code == 403
        assert "APM" in r2.text
    finally:
        # Always re-enable APM
        r3 = requests.put(f"{BASE_URL}/api/modules/APM", headers=ta_headers,
                          json={"enabled": True}, timeout=15)
        assert r3.status_code == 200
    r4 = requests.get(f"{BASE_URL}/api/assets", headers=ta_headers, timeout=15)
    assert r4.status_code == 200


# ---------- Users listing ----------
def test_list_users_tenant_admin(ta_headers):
    r = requests.get(f"{BASE_URL}/api/users", headers=ta_headers, timeout=15)
    assert r.status_code == 200
    users = r.json()
    assert isinstance(users, list)
    assert len(users) == 5
    for u in users:
        assert "role" in u
        assert "employee_id" in u
    ops = [u for u in users if u["role"] == "OPERATOR"]
    assert len(ops) >= 1
    op = ops[0]
    assert op.get("assigned_asset") is not None
    assert op["assigned_asset"]["asset_code"] == "CNC-DEMO-01"
    assert "name" in op["assigned_asset"]


def test_list_users_forbidden_for_operator(op_headers):
    r = requests.get(f"{BASE_URL}/api/users", headers=op_headers, timeout=15)
    assert r.status_code == 403


# ---------- Assign machine ----------
def _get_operator(ta_headers):
    users = requests.get(f"{BASE_URL}/api/users", headers=ta_headers, timeout=15).json()
    return [u for u in users if u["role"] == "OPERATOR"][0]


def _get_admin(ta_headers):
    users = requests.get(f"{BASE_URL}/api/users", headers=ta_headers, timeout=15).json()
    return [u for u in users if u["role"] == "TENANT_ADMIN"][0]


def _get_cnc_demo_id(ta_headers):
    assets = requests.get(f"{BASE_URL}/api/assets", headers=ta_headers, timeout=15).json()
    return [a for a in assets if a["asset_code"] == "CNC-DEMO-01"][0]["id"]


def test_assign_operator_by_supervisor_then_reset(ta_headers, sup_headers):
    op = _get_operator(ta_headers)
    # find a Press asset (asset_type contains 'Press')
    assets = requests.get(f"{BASE_URL}/api/assets", headers=ta_headers, timeout=15).json()
    presses = [a for a in assets if "Press" in a.get("asset_type", "")]
    assert presses, "No Press assets found"
    press_id = presses[0]["id"]
    press_code = presses[0]["asset_code"]

    r = requests.put(f"{BASE_URL}/api/users/{op['id']}/assign", headers=sup_headers,
                     json={"assigned_asset_id": press_id}, timeout=15)
    assert r.status_code == 200, r.text

    # verify change
    users = requests.get(f"{BASE_URL}/api/users", headers=ta_headers, timeout=15).json()
    op2 = [u for u in users if u["id"] == op["id"]][0]
    assert op2["assigned_asset"]["asset_code"] == press_code

    # reset back to CNC-DEMO-01
    cnc_id = _get_cnc_demo_id(ta_headers)
    r2 = requests.put(f"{BASE_URL}/api/users/{op['id']}/assign", headers=sup_headers,
                      json={"assigned_asset_id": cnc_id}, timeout=15)
    assert r2.status_code == 200
    users = requests.get(f"{BASE_URL}/api/users", headers=ta_headers, timeout=15).json()
    op3 = [u for u in users if u["id"] == op["id"]][0]
    assert op3["assigned_asset"]["asset_code"] == "CNC-DEMO-01"


def test_assign_forbidden_for_operator(ta_headers, op_headers):
    op = _get_operator(ta_headers)
    cnc = _get_cnc_demo_id(ta_headers)
    r = requests.put(f"{BASE_URL}/api/users/{op['id']}/assign", headers=op_headers,
                     json={"assigned_asset_id": cnc}, timeout=15)
    assert r.status_code == 403


def test_assign_tenant_admin_returns_400(ta_headers):
    admin = _get_admin(ta_headers)
    cnc = _get_cnc_demo_id(ta_headers)
    r = requests.put(f"{BASE_URL}/api/users/{admin['id']}/assign", headers=ta_headers,
                     json={"assigned_asset_id": cnc}, timeout=15)
    assert r.status_code == 400


def test_assign_invalid_asset_returns_404(ta_headers):
    op = _get_operator(ta_headers)
    r = requests.put(f"{BASE_URL}/api/users/{op['id']}/assign", headers=ta_headers,
                     json={"assigned_asset_id": "does-not-exist-123"}, timeout=15)
    assert r.status_code == 404


# ---------- Plant filter ----------
def _plants(ta_headers):
    return requests.get(f"{BASE_URL}/api/plants", headers=ta_headers, timeout=15).json()


def test_dashboard_summary_plant_filter(ta_headers):
    plants = _plants(ta_headers)
    pune = [p for p in plants if p["name"] == "Pune Plant"][0]
    unfiltered = requests.get(f"{BASE_URL}/api/dashboard/summary", headers=ta_headers, timeout=15).json()
    filtered = requests.get(f"{BASE_URL}/api/dashboard/summary?plant_id={pune['id']}",
                            headers=ta_headers, timeout=15).json()
    total_pune = filtered["kpis"]["total_assets"]
    total_all = unfiltered["kpis"]["total_assets"]
    assert 45 <= total_pune <= 47
    assert total_pune < total_all
    # recent_alarms all belong to Pune assets
    pune_assets = requests.get(f"{BASE_URL}/api/assets?plant_id={pune['id']}",
                               headers=ta_headers, timeout=15).json()
    pune_codes = {a["asset_code"] for a in pune_assets}
    for al in filtered.get("recent_alarms", []):
        assert al["asset_code"] in pune_codes


def test_assets_plant_filter_mumbai(ta_headers):
    plants = _plants(ta_headers)
    mum = [p for p in plants if p["name"] == "Mumbai Plant"][0]
    r = requests.get(f"{BASE_URL}/api/assets?plant_id={mum['id']}", headers=ta_headers, timeout=15)
    assert r.status_code == 200
    lst = r.json()
    assert len(lst) == 8
    for a in lst:
        assert a["plant_id"] == mum["id"]


# ---------- WebSocket module broadcast ----------
def test_ws_broadcast_on_module_toggle(ta_login, ta_headers):
    token = ta_login["access_token"]

    async def run():
        url = f"{WS_BASE}/api/ws/telemetry?token={token}"
        async with websockets.connect(url) as ws:
            # Trigger a toggle (flip REPORTS on)
            requests.put(f"{BASE_URL}/api/modules/REPORTS", headers=ta_headers,
                         json={"enabled": True}, timeout=10)
            deadline = time.time() + 10
            while time.time() < deadline:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=6)
                    data = json.loads(msg)
                    if data.get("type") == "modules":
                        return data
                except asyncio.TimeoutError:
                    break
        return None

    data = asyncio.new_event_loop().run_until_complete(run())
    assert data is not None
    assert data["type"] == "modules"
    assert isinstance(data.get("modules"), dict)
    assert set(data["modules"].keys()) >= MODULE_KEYS
