"""Instagram connector tests: fail-closed when unconfigured or
unconnected, real OAuth flow with stubbed HTTP, no fake states."""

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.auth import require_user
from app.config import settings
from app.main import app

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def _configure(monkeypatch) -> None:
    monkeypatch.setattr(settings, "INSTAGRAM_CLIENT_ID", "ig-client-id")
    monkeypatch.setattr(settings, "INSTAGRAM_CLIENT_SECRET", "ig-client-secret")
    monkeypatch.setattr(settings, "INSTAGRAM_REDIRECT_URI", "https://example.test/ig/callback")
    monkeypatch.setattr(settings, "CONNECTOR_TOKEN_KEY", Fernet.generate_key().decode())


def _begin_state(monkeypatch) -> str:
    _configure(monkeypatch)
    started = client.post("/api/v1/connectors/instagram/start")
    assert started.status_code == 200
    url = started.json()["authorization_url"]
    assert "instagram.com/oauth/authorize" in url
    assert "client_id=ig-client-id" in url
    assert "instagram_business_basic" in url
    state = url.split("state=")[1].split("&")[0]
    return state


def test_instagram_fails_closed_when_not_configured() -> None:
    _as("user-a")
    status = client.get("/api/v1/connectors/instagram/status")
    assert status.status_code == 200
    assert status.json() == {"configured": False, "connected": False, "username": None}

    start = client.post("/api/v1/connectors/instagram/start")
    assert start.status_code == 503


def test_instagram_reads_fail_closed_without_connection(monkeypatch) -> None:
    _configure(monkeypatch)
    _as("user-a")
    assert client.get("/api/v1/connectors/instagram/profile").status_code == 409
    assert client.get("/api/v1/connectors/instagram/media").status_code == 409


def test_instagram_complete_rejects_bad_state(monkeypatch) -> None:
    _configure(monkeypatch)
    _as("user-a")
    callback = client.get("/api/v1/connectors/instagram/callback?state=nope&code=code")
    assert callback.status_code == 403


def test_instagram_complete_and_reads(monkeypatch) -> None:
    from app.services import instagram_connector

    state = _begin_state(monkeypatch)

    def fake_post_form(url, form):
        assert "api.instagram.com/oauth/access_token" in url
        return {"access_token": "IGQVJSHORT", "user_id": "17841400008460056"}

    def fake_get_json(url, params):
        if "ig_exchange_token" in params.get("grant_type", ""):
            return {"access_token": "IGQVJLONG", "token_type": "bearer", "expires_in": 5184000}
        if url.endswith("/me"):
            return {
                "id": "17841400008460056",
                "username": "oldembermusic",
                "account_type": "BUSINESS",
                "media_count": 42,
            }
        if url.endswith("/me/media"):
            return {
                "data": [
                    {
                        "id": "17895695668004550",
                        "caption": "New song",
                        "media_type": "VIDEO",
                        "media_url": "https://example.test/video.mp4",
                        "permalink": "https://www.instagram.com/p/ABC/",
                        "timestamp": "2026-11-25T10:00:00+00:00",
                    }
                ]
            }
        raise AssertionError(f"unexpected GET {url} {params}")

    monkeypatch.setattr(instagram_connector, "_post_form", fake_post_form)
    monkeypatch.setattr(instagram_connector, "_get_json", fake_get_json)

    callback = client.get(f"/api/v1/connectors/instagram/callback?state={state}&code=auth-code")
    assert callback.status_code == 200
    assert "Instagram connected" in callback.text

    status = client.get("/api/v1/connectors/instagram/status")
    assert status.json() == {"configured": True, "connected": True, "username": "oldembermusic"}

    profile = client.get("/api/v1/connectors/instagram/profile")
    assert profile.status_code == 200
    assert profile.json()["username"] == "oldembermusic"
    assert profile.json()["media_count"] == 42

    media = client.get("/api/v1/connectors/instagram/media?limit=5")
    assert media.status_code == 200
    assert len(media.json()) == 1
    assert media.json()[0]["media_type"] == "VIDEO"

    removed = client.delete("/api/v1/connectors/instagram")
    assert removed.json() == {"disconnected": True}
    assert client.get("/api/v1/connectors/instagram/status").json()["connected"] is False
