import time

from conftest import PASSWORD, login


# ---------------------------------------------------------------- sign in

def test_login_and_me(client, admin):
    me = client.get("/api/auth/me", headers=admin).json()
    assert me["username"] == "admin" and me["isAdmin"] and me["role"] == "mgr"


def test_wrong_password_and_no_token(client):
    assert client.post("/api/auth/login", json={"username": "admin", "password": "nope"}).status_code == 401
    assert client.get("/api/bootstrap").status_code == 401
    assert client.get("/api/bootstrap", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_disabled_user_cannot_sign_in(client, admin):
    uid = next(u["id"] for u in client.get("/api/users", headers=admin).json() if u["username"] == "skhan")
    assert client.patch(f"/api/users/{uid}", headers=admin, json={"active": False}).status_code == 200
    assert client.post("/api/auth/login", json={"username": "skhan", "password": PASSWORD}).status_code == 401


def test_change_password(client, operator):
    r = client.post("/api/auth/password", headers=operator, json={"current": PASSWORD, "new": "Another-pass-456"})
    assert r.status_code == 200
    assert client.post("/api/auth/login", json={"username": "skhan", "password": "Another-pass-456"}).status_code == 200


# ---------------------------------------------------------------- start-up data

def test_bootstrap_has_everything(client, admin):
    b = client.get("/api/bootstrap", headers=admin).json()
    assert set(b["catalog"]) == {"IC", "AS", "FIREG", "UC", "MOD"}
    assert len(b["liveIndex"]) == 526
    assert len(b["alarms"]) == 82 and all(a["st"] == "Active" for a in b["alarms"])
    assert len(b["workOrders"]) == 56
    assert len(b["records"]["logbook"]) == 4
    assert len(b["audit"]) >= 6
    assert b["canEdit"] is True
    # every live path points at a value in the catalog
    for path in b["liveIndex"].values():
        node = b["catalog"]
        for k in path:
            node = node[k]
        assert isinstance(node, (int, float, str))


def test_cxo_is_read_only(client, cxo):
    assert client.get("/api/bootstrap", headers=cxo).json()["canEdit"] is False
    assert client.post("/api/alarms/1/ack", headers=cxo).status_code == 403
    assert client.post("/api/work-orders", headers=cxo, json={"t": "x"}).status_code == 403


# ---------------------------------------------------------------- alarms

def test_acknowledge(client, operator):
    a = client.post("/api/alarms/1/ack", headers=operator).json()
    assert a["st"] == "Acknowledged" and a["by"] == "S. Khan"
    out = client.post("/api/alarms/ack", headers=operator, json={"ids": [2, 3, 1]}).json()
    assert {x["id"] for x in out} == {1, 2, 3}
    assert client.post("/api/alarms/9999/ack", headers=operator).status_code == 404
    assert len(client.get("/api/alarms?state=Active", headers=operator).json()) == 79


# ---------------------------------------------------------------- work orders

def test_work_order_lifecycle(client, operator, supervisor):
    taken = client.get("/api/work-orders", headers=operator).json()[0]["id"]
    w = client.post("/api/work-orders", headers=operator, json={
        "id": taken, "t": "Replace seal", "aid": "apm:apm:3", "asset": "Jockey Pump", "cat": "apm",
        "type": "Breakdown", "pri": "High", "st": "Assigned", "who": "M. Jadhav", "due": "30 Nov"}).json()
    assert w["id"] != taken and w["id"].startswith("WO-") and w["mod"] == "apm" and w["by"] == "S. Khan"
    # an operator who is not the assignee cannot move it
    assert client.patch(f"/api/work-orders/{w['id']}", headers=operator, json={"st": "Done"}).status_code == 403
    r = client.patch(f"/api/work-orders/{w['id']}", headers=supervisor, json={"st": "In progress"})
    assert r.status_code == 200 and r.json()["st"] == "In progress"
    assert client.patch(f"/api/work-orders/{w['id']}", headers=supervisor, json={"st": "Paused"}).status_code == 422
    assert client.delete(f"/api/work-orders/{w['id']}", headers=operator).status_code == 403
    assert client.delete(f"/api/work-orders/{w['id']}", headers=supervisor).status_code == 200


def test_assignee_can_progress_own_work_order(client, admin):
    w = client.post("/api/work-orders", headers=admin, json={"t": "Check", "aid": "ems::0", "who": "S. Khan"}).json()
    assert w["mod"] == "ems" and w["cat"] is None
    op = login(client, "skhan")
    assert client.patch(f"/api/work-orders/{w['id']}", headers=op, json={"st": "Done"}).status_code == 200


# ---------------------------------------------------------------- shared settings and preferences

def test_limits_need_a_lead_and_reach_the_simulator(client, operator, supervisor):
    body = {"apm:apm:1|Pressure": {"hi": "11", "lo": "6"}}
    assert client.put("/api/state/limits", headers=operator, json=body).status_code == 403
    assert client.put("/api/state/limits", headers=supervisor, json=body).status_code == 200
    assert client.get("/api/state", headers=operator).json()["limits"] == body
    live = client.app.state.live[1]
    p = next(x for x in live.params if x.asset_key == "apm:apm:1" and x.name == "Pressure")
    assert p.limits(live.limits)[:2] == (6.0, 11.0)
    a = client.get("/api/assets/apm:apm:1", headers=operator).json()
    assert next(r for r in a["readings"] if r["name"] == "Pressure")["hi"] == 11.0


def test_unknown_setting_and_bad_value(client, admin):
    assert client.put("/api/state/secret", headers=admin, json={}).status_code == 404
    assert client.put("/api/state/rca", headers=admin, json="text").status_code == 422


def test_preferences_are_personal(client, admin, operator):
    client.put("/api/prefs", headers=admin, json={"theme": "dark", "klim": {"x": 1}})
    assert client.get("/api/prefs", headers=admin).json() == {"theme": "dark"}
    assert client.get("/api/prefs", headers=operator).json() == {}


# ---------------------------------------------------------------- records and files

def test_records(client, operator, supervisor):
    reg = {"id": "r123", "type": "asset", "mod": "apm", "cat": "apm", "plant": "Nashik Plant",
           "f": {"name": "Booster pump 3"}, "files": [], "at": "2026-11-26T10:00:00Z"}
    assert client.put("/api/records/register/r123", headers=operator, json=reg).status_code == 200
    got = client.get("/api/records/register", headers=operator).json()
    assert got[0]["f"]["name"] == "Booster pump 3" and got[0]["cid"] == "r123"
    client.put("/api/records/entry/e1", headers=operator, json={"t": "10:00", "ty": "Count", "by": "S. Khan", "sum": "x", "m": "oee"})
    assert client.get("/api/records/entry", headers=operator).json()[0]["m"] == "oee"
    assert client.put("/api/records/logbook/l1", headers=operator, json={"row": "no"}).status_code == 422
    assert client.put("/api/records/nope/x", headers=operator, json={}).status_code == 404
    assert client.put("/api/records/register/bad id!", headers=operator, json={}).status_code in (404, 422)
    assert client.delete("/api/records/register/r123", headers=operator).status_code == 403
    assert client.delete("/api/records/register/r123", headers=supervisor).status_code == 200


def test_files(client, operator):
    up = client.post("/api/files", headers=operator, data={"id": "f1", "meta": '{"size": 5}'},
                     files={"file": ("manual.pdf", b"%PDF-1.4 hello", "application/pdf")})
    assert up.status_code == 201 and up.json()["id"] == "f1"
    r = client.get("/api/files/f1", headers=operator)
    assert r.content == b"%PDF-1.4 hello" and r.headers["content-type"] == "application/pdf"
    assert "manual.pdf" in r.headers["content-disposition"]
    assert client.delete("/api/files/f1", headers=operator).status_code == 200
    assert client.get("/api/files/f1", headers=operator).status_code == 404


def test_upload_limit(client, operator):
    client.app.state.settings.max_upload_mb = 1
    big = b"x" * (1024 * 1024 + 10)
    assert client.post("/api/files", headers=operator, files={"file": ("big.bin", big)}).status_code == 413


# ---------------------------------------------------------------- audit trail

def test_audit_uses_the_signed_in_person(client, supervisor):
    e = client.post("/api/audit", headers={**supervisor, "User-Agent": "Mozilla Chrome/130"},
                    json={"action": "Signed permit", "obj": "P-121 Issuer", "mod": "Telematics"}).json()
    assert e["user"] == "R. Patil" and e["role"] == "Supervisor" and "Chrome" in e["dev"]
    found = client.get("/api/audit?q=P-121 Issuer", headers=supervisor).json()
    assert found and found[0]["action"] == "Signed permit"


# ---------------------------------------------------------------- readings

def test_assets_history_and_export(client, operator):
    assets = client.get("/api/assets?module=apm&category=apm", headers=operator).json()
    assert len(assets) == 15 and assets[1]["name"] == "Main Fire Pump"
    pid = assets[1]["readings"][0]["id"]
    h = client.get(f"/api/parameters/{pid}/history?hours=2", headers=operator).json()
    assert len(h["points"]) >= 5
    csv = client.get("/api/export/readings.csv?asset=apm:apm:1&hours=2", headers=operator)
    assert csv.status_code == 200 and csv.text.startswith("time_utc,asset,reading,unit,value")
    assert "apm:apm:1,Pressure,bar" in csv.text
    assert client.get("/api/assets/nope", headers=operator).status_code == 404


# ---------------------------------------------------------------- people

def test_user_admin(client, admin, operator):
    assert client.get("/api/users", headers=operator).status_code == 403
    r = client.post("/api/users", headers=admin, json={"username": "vkale", "name": "V. Kale", "role": "sup",
                                                       "title": "Maintenance", "password": "Kale-pass-789"})
    assert r.status_code == 201
    assert client.post("/api/users", headers=admin, json={"username": "vkale", "name": "x", "role": "sup",
                                                          "password": "Kale-pass-789"}).status_code == 409
    assert client.post("/api/users", headers=admin, json={"username": "zz", "name": "x", "role": "boss",
                                                          "password": "Kale-pass-789"}).status_code == 422
    assert client.post("/api/auth/login", json={"username": "vkale", "password": "Kale-pass-789"}).status_code == 200
    me = client.get("/api/auth/me", headers=admin).json()
    assert client.patch(f"/api/users/{me['id']}", headers=admin, json={"isAdmin": False}).status_code == 400


# ---------------------------------------------------------------- live push

def test_websocket_needs_sign_in_and_gets_changes(client, admin):
    import pytest
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws") as ws:
            ws.receive_text()
    r = client.post("/api/auth/login", json={"username": "rpatil", "password": PASSWORD})
    token = r.json()["token"]
    client.cookies.set("coreot_token", token)
    with client.websocket_connect("/ws") as ws:
        client.put("/api/state/rca", headers=admin, json={"7": 1})
        msg = ws.receive_json()
        assert msg["type"] == "state" and msg["key"] == "rca" and msg["value"] == {"7": 1}
        ws.send_text("ping")
        assert ws.receive_json()["type"] == "pong"


def test_health(client):
    h = client.get("/api/health").json()
    assert h["ok"] and h["simulator"] is False


def test_web_app_is_served(client):
    assert "boot.js" in client.get("/").text
    assert "Sign in" in client.get("/login").text
    assert client.get("/js/bridge.js").status_code == 200
