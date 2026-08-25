from fastapi.testclient import TestClient

from app.main import app


def test_health():
    with TestClient(app) as client:
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


def test_create_investigation_returns_id():
    with TestClient(app) as client:
        resp = client.post("/investigations", json={"run_date": "2026-08-16"})
        assert resp.status_code == 200
        body = resp.json()
        assert "investigation_id" in body
        assert body["status"] == "pending"
