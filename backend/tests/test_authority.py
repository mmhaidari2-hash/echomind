from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def test_action_does_not_execute_without_explicit_confirmation() -> None:
    _as("user-a")
    proposed = client.post(
        "/api/v1/authority/actions",
        json={
            "tool": "memory.remember",
            "summary": "Remember the preferred station",
            "parameters": {"key": "station", "value": "Richmond"},
            "idempotency_key": "remember-richmond",
        },
    )
    assert proposed.status_code == 200
    action = proposed.json()
    assert action["status"] == "proposed"

    profile = client.get("/api/v1/memory/profile")
    assert profile.status_code == 200
    assert profile.json()["facts"] == []

    refused = client.post(
        f"/api/v1/authority/actions/{action['id']}/confirm",
        json={"confirm": False},
    )
    assert refused.status_code == 400

    profile = client.get("/api/v1/memory/profile")
    assert profile.json()["facts"] == []


def test_confirmed_action_executes_once_and_is_audited() -> None:
    _as("user-a")
    proposed = client.post(
        "/api/v1/authority/actions",
        json={
            "tool": "memory.remember",
            "summary": "Remember the preferred station",
            "parameters": {"key": "station", "value": "Richmond"},
            "idempotency_key": "remember-richmond",
        },
    ).json()

    executed = client.post(
        f"/api/v1/authority/actions/{proposed['id']}/confirm",
        json={"confirm": True},
    )
    assert executed.status_code == 200
    assert executed.json()["status"] == "executed"

    duplicate = client.post(
        "/api/v1/authority/actions",
        json={
            "tool": "memory.remember",
            "summary": "Remember the preferred station",
            "parameters": {"key": "station", "value": "Richmond"},
            "idempotency_key": "remember-richmond",
        },
    )
    assert duplicate.status_code == 200
    assert duplicate.json()["id"] == proposed["id"]

    facts = client.get("/api/v1/memory/facts").json()
    assert len(facts) == 1
    assert facts[0]["value"] == "Richmond"

    audit = client.get("/api/v1/authority/audit")
    assert audit.status_code == 200
    events = [row["event"] for row in audit.json()]
    assert "proposed" in events
    assert "confirmed" in events
    assert "executed" in events


def test_actions_are_private_to_owner() -> None:
    _as("user-a")
    created = client.post(
        "/api/v1/authority/actions",
        json={
            "tool": "watch.create",
            "summary": "Track a purchase deadline",
            "parameters": {"kind": "purchase", "title": "Laptop", "locale": "en"},
        },
    )
    assert created.status_code == 200

    _as("user-b")
    assert client.get("/api/v1/authority/actions").json() == []
    assert client.get("/api/v1/authority/audit").json() == []
