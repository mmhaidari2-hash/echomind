from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def test_google_connector_fails_closed_when_not_configured() -> None:
    _as("user-a")
    status = client.get("/api/v1/connectors/google/status")
    assert status.status_code == 200
    assert status.json() == {
        "configured": False,
        "connected": False,
        "scopes": [],
        "expires_at": None,
    }

    start = client.post("/api/v1/connectors/google/start?access=read")
    assert start.status_code == 503


def test_google_write_action_cannot_bypass_missing_connection() -> None:
    _as("user-a")
    proposed = client.post(
        "/api/v1/authority/actions",
        json={
            "tool": "gmail.send",
            "summary": "Send a test message",
            "parameters": {
                "to": "person@example.com",
                "subject": "Test",
                "body": "Hello",
            },
        },
    )
    assert proposed.status_code == 200

    executed = client.post(
        f"/api/v1/authority/actions/{proposed.json()['id']}/confirm",
        json={"confirm": True},
    )
    assert executed.status_code == 409

    actions = client.get("/api/v1/authority/actions").json()
    assert actions[0]["status"] == "failed"
