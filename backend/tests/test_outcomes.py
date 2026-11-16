from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def test_outcome_loop_requires_verification_for_expired_promises() -> None:
    _as("user-a")
    client.post(
        "/api/v1/life/promises",
        json={
            "counterparty": "Retailer",
            "promise": "Refund by Friday",
            "due_date": (date.today() - timedelta(days=1)).isoformat(),
        },
    )
    rows = client.get("/api/v1/outcomes")
    assert rows.status_code == 200
    item = rows.json()[0]
    assert item["kind"] == "promise_verification"
    assert item["priority"] == "urgent"
    assert item["requires_verification"] is True


def test_outcome_loop_surfaces_due_obligation_without_cross_user_leak() -> None:
    _as("user-a")
    client.post(
        "/api/v1/life/obligations",
        json={"title": "Submit Delay Repay", "due_date": (date.today() + timedelta(days=2)).isoformat()},
    )
    assert client.get("/api/v1/outcomes").json()[0]["priority"] == "soon"

    _as("user-b")
    assert client.get("/api/v1/outcomes").json() == []
