import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

PASSWORD = "Test-pass-123"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("COREOT_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("COREOT_DEMO_PASSWORD", PASSWORD)
    monkeypatch.setenv("COREOT_SECRET_KEY", "test-secret-key-that-is-long-enough-123456")
    app = create_app(Settings(), run_simulator=False, history_hours=1)
    with TestClient(app) as c:
        yield c


def login(c, username):
    r = c.post("/api/auth/login", json={"username": username, "password": PASSWORD})
    assert r.status_code == 200, r.text
    c.cookies.clear()  # tests use the bearer token, like the web app
    return {"Authorization": "Bearer " + r.json()["token"]}


@pytest.fixture()
def admin(client):
    return login(client, "admin")


@pytest.fixture()
def operator(client):
    return login(client, "skhan")


@pytest.fixture()
def supervisor(client):
    return login(client, "rpatil")


@pytest.fixture()
def cxo(client):
    return login(client, "nkulkarni")
