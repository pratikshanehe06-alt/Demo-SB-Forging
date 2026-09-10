"""Iteration 7 — Reports & Forecasting backend tests."""
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

TENANT = "SBF"
ADMIN_EMAIL = "tenantadmin@sbforgtech.com"
ADMIN_PASS = "Admin@123"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={
        "tenant_code": TENANT, "email": ADMIN_EMAIL, "password": ADMIN_PASS
    })
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def H(token):
    return {"Authorization": f"Bearer {token}"}


REPORT_TYPES = ["PRODUCTION", "OEE", "ENERGY", "DOWNTIME", "MAINTENANCE"]


# ---------- Catalog ----------
def test_catalog(H):
    r = requests.get(f"{API}/reports/catalog", headers=H)
    assert r.status_code == 200
    j = r.json()
    keys = [x["key"] for x in j["reports"]]
    assert set(REPORT_TYPES).issubset(set(keys)), keys
    assert set(["daily", "weekly", "monthly"]).issubset(set(j["aggregations"]))


# ---------- Run all 5 types with forecast ----------
@pytest.mark.parametrize("rtype", REPORT_TYPES)
def test_run_report(H, rtype):
    payload = {"report_type": rtype, "aggregation": "daily",
               "include_forecast": True, "forecast_periods": 7}
    r = requests.post(f"{API}/reports/run", headers=H, json=payload)
    assert r.status_code == 200, r.text
    j = r.json()
    for f in ("kpis", "columns", "rows", "detail_columns", "detail_rows", "forecast"):
        assert f in j, f"missing {f} in {rtype}"
    assert isinstance(j["rows"], list)
    # forecast may be None if < 3 rows; if present verify bounds
    if j["forecast"] and j["forecast"].get("points"):
        for p in j["forecast"]["points"]:
            assert "step" in p and "value" in p and "lower" in p and "upper" in p
            assert p["lower"] <= p["value"] <= p["upper"], p


# ---------- Aggregation bucket count ----------
def test_aggregation_bucket_counts(H):
    base = {"report_type": "PRODUCTION", "include_forecast": False,
            "start_date": "2025-01-01", "end_date": "2025-12-31"}
    counts = {}
    for agg in ("daily", "weekly", "monthly"):
        p = dict(base, aggregation=agg)
        r = requests.post(f"{API}/reports/run", headers=H, json=p)
        assert r.status_code == 200
        counts[agg] = len(r.json()["rows"])
    assert counts["monthly"] < counts["weekly"] < counts["daily"], counts


# ---------- Filter by plant / asset ----------
def test_filter_plant_asset(H):
    # Get a plant & asset
    plants = requests.get(f"{API}/plants", headers=H).json()
    assert plants
    plant_id = plants[0]["id"]
    assets = requests.get(f"{API}/assets", headers=H).json()
    if not assets:
        pytest.skip("no assets")
    asset_id = assets[0]["id"]

    base_payload = {"report_type": "PRODUCTION", "aggregation": "daily"}
    r_all = requests.post(f"{API}/reports/run", headers=H, json=base_payload).json()
    r_p = requests.post(f"{API}/reports/run", headers=H,
                        json=dict(base_payload, plant_id=plant_id)).json()
    r_a = requests.post(f"{API}/reports/run", headers=H,
                        json=dict(base_payload, asset_id=asset_id)).json()
    # detail_rows narrower or equal
    assert len(r_p["detail_rows"]) <= len(r_all["detail_rows"])
    assert len(r_a["detail_rows"]) <= len(r_all["detail_rows"])


# ---------- Exports ----------
def test_export_csv(H):
    r = requests.post(f"{API}/reports/export", headers=H,
                      json={"report_type": "PRODUCTION", "aggregation": "daily", "format": "csv"})
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    assert "attachment" in r.headers.get("content-disposition", "").lower()
    assert "CoreOT" in r.text


def test_export_pdf(H):
    r = requests.post(f"{API}/reports/export", headers=H,
                      json={"report_type": "OEE", "aggregation": "daily", "format": "pdf",
                            "include_forecast": True})
    assert r.status_code == 200, r.text[:200]
    assert "application/pdf" in r.headers.get("content-type", "")
    assert len(r.content) > 2048, f"pdf too small {len(r.content)}"


def test_export_json(H):
    r = requests.post(f"{API}/reports/export", headers=H,
                      json={"report_type": "ENERGY", "aggregation": "weekly", "format": "json"})
    assert r.status_code == 200
    assert "application/json" in r.headers.get("content-type", "")
    assert "attachment" in r.headers.get("content-disposition", "").lower()
    j = r.json()
    assert j["report_type"] == "ENERGY"


# ---------- Templates CRUD ----------
def test_templates_crud(H):
    payload = {"name": "TEST_iter7_template",
               "request": {"report_type": "PRODUCTION", "aggregation": "weekly",
                           "include_forecast": True, "forecast_periods": 4}}
    r = requests.post(f"{API}/reports/templates", headers=H, json=payload)
    assert r.status_code == 200, r.text
    t = r.json()
    tid = t["id"]
    assert t["name"] == "TEST_iter7_template"

    r = requests.get(f"{API}/reports/templates", headers=H)
    assert r.status_code == 200
    assert any(x["id"] == tid for x in r.json())

    r = requests.delete(f"{API}/reports/templates/{tid}", headers=H)
    assert r.status_code == 200
    r = requests.get(f"{API}/reports/templates", headers=H)
    assert not any(x["id"] == tid for x in r.json())


# ---------- Module gating (last: restores REPORTS=true) ----------
def test_zzz_module_gating(H):
    # disable
    r = requests.put(f"{API}/modules/REPORTS", headers=H, json={"enabled": False})
    assert r.status_code == 200, r.text
    try:
        r = requests.get(f"{API}/reports/catalog", headers=H)
        assert r.status_code == 403
        r = requests.post(f"{API}/reports/run", headers=H,
                          json={"report_type": "PRODUCTION", "aggregation": "daily"})
        assert r.status_code == 403
    finally:
        rr = requests.put(f"{API}/modules/REPORTS", headers=H, json={"enabled": True})
        assert rr.status_code == 200
    # verify back up
    r = requests.get(f"{API}/reports/catalog", headers=H)
    assert r.status_code == 200
