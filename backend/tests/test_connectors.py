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


def test_gmail_cleanup_query_excludes_important_mail() -> None:
    from app.services.google_connector import gmail_cleanup_query

    query = gmail_cleanup_query(30)
    assert "older_than:30d" in query
    assert "category:promotions" in query
    assert "category:social" in query
    assert "category:forums" in query
    assert "-is:starred" in query
    assert "-label:important" in query
    assert "-in:trash" in query


def test_gmail_trash_action_requires_connection_and_confirmation() -> None:
    _as("user-a")
    proposed = client.post(
        "/api/v1/authority/actions",
        json={
            "tool": "gmail.trash",
            "summary": "Move low-priority messages to Trash",
            "parameters": {"message_ids": ["gmail-message-1"]},
        },
    )
    assert proposed.status_code == 200
    assert proposed.json()["status"] == "proposed"

    actions = client.get("/api/v1/authority/actions").json()
    assert actions[0]["status"] == "proposed"

    executed = client.post(
        f"/api/v1/authority/actions/{proposed.json()['id']}/confirm",
        json={"confirm": True},
    )
    assert executed.status_code == 409

    actions = client.get("/api/v1/authority/actions").json()
    assert actions[0]["status"] == "failed"


def test_google_start_accepts_extra_scopes(monkeypatch) -> None:
    """Drive/Docs/Sheets ride the same Google account: the hub requests
    their scopes through /connectors/google/start?scopes=..."""
    from cryptography.fernet import Fernet

    from app.config import settings

    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "google-client-id")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "google-client-secret")
    monkeypatch.setattr(settings, "GOOGLE_REDIRECT_URI", "https://example.test/google/callback")
    monkeypatch.setattr(settings, "CONNECTOR_TOKEN_KEY", Fernet.generate_key().decode())
    _as("user-a")

    drive = "https://www.googleapis.com/auth/drive.readonly"
    started = client.post(f"/api/v1/connectors/google/start?scopes={drive}")
    assert started.status_code == 200
    url = started.json()["authorization_url"]
    assert "accounts.google.com" in url
    assert "drive.readonly" in url

    # Non-https scope values are dropped, never requested.
    started = client.post("/api/v1/connectors/google/start?scopes=evil-scope")
    assert started.status_code == 200
    assert "evil-scope" not in started.json()["authorization_url"]
