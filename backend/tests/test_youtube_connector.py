"""YouTube connector tests: rides the Google token; connected only when
the youtube.readonly scope was granted. No fake states."""

from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.auth import require_user
from app.config import settings
from app.main import app

client = TestClient(app)

YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly"
GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def _configure_google(monkeypatch) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "google-client-id")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "google-client-secret")
    monkeypatch.setattr(settings, "GOOGLE_REDIRECT_URI", "https://example.test/google/callback")
    monkeypatch.setattr(settings, "CONNECTOR_TOKEN_KEY", Fernet.generate_key().decode())


def _seed_google_token(scopes: str) -> None:
    from app.services import google_connector

    google_connector._save_token(
        "user-a",
        {
            "access_token": "ya29.test",
            "refresh_token": "1//test-refresh",
            "scope": scopes,
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        },
    )


def test_youtube_fails_closed_when_google_not_configured() -> None:
    _as("user-a")
    status = client.get("/api/v1/connectors/youtube/status")
    assert status.status_code == 200
    assert status.json() == {"configured": False, "connected": False, "scopes": []}

    start = client.post("/api/v1/connectors/youtube/start")
    assert start.status_code == 503


def test_youtube_connected_only_with_youtube_scope(monkeypatch) -> None:
    _configure_google(monkeypatch)
    _as("user-a")

    _seed_google_token(GMAIL_SCOPE)
    status = client.get("/api/v1/connectors/youtube/status")
    assert status.json()["configured"] is True
    assert status.json()["connected"] is False

    _seed_google_token(f"{GMAIL_SCOPE} {YOUTUBE_SCOPE}")
    status = client.get("/api/v1/connectors/youtube/status")
    assert status.json()["connected"] is True
    assert YOUTUBE_SCOPE in status.json()["scopes"]


def test_youtube_start_requests_youtube_scope(monkeypatch) -> None:
    _configure_google(monkeypatch)
    _as("user-a")
    started = client.post("/api/v1/connectors/youtube/start")
    assert started.status_code == 200
    url = started.json()["authorization_url"]
    assert "accounts.google.com" in url
    assert "youtube.readonly" in url


def test_youtube_reads_fail_closed_without_scope(monkeypatch) -> None:
    _configure_google(monkeypatch)
    _as("user-a")
    assert client.get("/api/v1/connectors/youtube/channel").status_code == 409
    assert client.get("/api/v1/connectors/youtube/videos").status_code == 409


def test_youtube_channel_and_videos(monkeypatch) -> None:
    from app.services import youtube_connector

    _configure_google(monkeypatch)
    _seed_google_token(f"{GMAIL_SCOPE} {YOUTUBE_SCOPE}")
    _as("user-a")

    def fake_get_json(url, access_token):
        assert access_token == "ya29.test"
        if "/channels" in url:
            return {
                "items": [
                    {
                        "id": "UColdembermusic",
                        "snippet": {
                            "title": "Old Ember",
                            "description": "Old soul, new blues.",
                            "thumbnails": {"default": {"url": "https://example.test/thumb.jpg"}},
                        },
                        "statistics": {"subscriberCount": "6", "videoCount": "55"},
                        "contentDetails": {"relatedPlaylists": {"uploads": "UUoldembermusic"}},
                    }
                ]
            }
        if "/playlistItems" in url:
            return {
                "items": [
                    {
                        "snippet": {
                            "title": "Same song",
                            "publishedAt": "2026-11-20T10:00:00Z",
                            "resourceId": {"videoId": "4Q2DtD226ws"},
                            "thumbnails": {"default": {"url": "https://example.test/v.jpg"}},
                        },
                        "contentDetails": {"videoId": "4Q2DtD226ws"},
                    }
                ]
            }
        raise AssertionError(f"unexpected GET {url}")

    monkeypatch.setattr(youtube_connector, "_get_json", fake_get_json)

    channel = client.get("/api/v1/connectors/youtube/channel")
    assert channel.status_code == 200
    assert channel.json()["title"] == "Old Ember"
    assert channel.json()["subscribers"] == 6
    assert channel.json()["video_count"] == 55

    videos = client.get("/api/v1/connectors/youtube/videos?limit=5")
    assert videos.status_code == 200
    assert len(videos.json()) == 1
    assert videos.json()[0]["id"] == "4Q2DtD226ws"
    assert videos.json()[0]["url"] == "https://www.youtube.com/watch?v=4Q2DtD226ws"
