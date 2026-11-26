"""Drive connector tests: rides the Google token; connected only when
the drive.readonly scope was granted. No fake states."""

from datetime import datetime, timedelta, timezone

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.auth import require_user
from app.config import settings
from app.main import app

client = TestClient(app)

DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
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


def test_drive_fails_closed_when_google_not_configured() -> None:
    _as("user-a")
    status = client.get("/api/v1/connectors/drive/status")
    assert status.status_code == 200
    assert status.json() == {"configured": False, "connected": False, "scopes": []}
    assert client.post("/api/v1/connectors/drive/start").status_code == 503


def test_drive_connected_only_with_drive_scope(monkeypatch) -> None:
    _configure_google(monkeypatch)
    _as("user-a")
    _seed_google_token(GMAIL_SCOPE)
    status = client.get("/api/v1/connectors/drive/status")
    assert status.json()["connected"] is False
    _seed_google_token(f"{GMAIL_SCOPE} {DRIVE_SCOPE}")
    status = client.get("/api/v1/connectors/drive/status")
    assert status.json()["connected"] is True
    assert DRIVE_SCOPE in status.json()["scopes"]


def test_drive_start_requests_drive_scope(monkeypatch) -> None:
    _configure_google(monkeypatch)
    _as("user-a")
    started = client.post("/api/v1/connectors/drive/start")
    assert started.status_code == 200
    url = started.json()["authorization_url"]
    assert "accounts.google.com" in url
    assert "drive.readonly" in url


def test_drive_reads_fail_closed_without_scope(monkeypatch) -> None:
    _configure_google(monkeypatch)
    _as("user-a")
    assert client.get("/api/v1/connectors/drive/search").status_code == 409
    assert client.get("/api/v1/connectors/drive/files/abc").status_code == 409


def test_drive_search_and_read_doc(monkeypatch) -> None:
    from app.services import drive_connector

    _configure_google(monkeypatch)
    _seed_google_token(f"{GMAIL_SCOPE} {DRIVE_SCOPE}")
    _as("user-a")

    def fake_get_json(url, access_token):
        assert access_token == "ya29.test"
        if "/files?" in url:
            assert "Avanti" in url
            return {
                "files": [
                    {
                        "id": "doc1",
                        "name": "Avanti claim",
                        "mimeType": "application/vnd.google-apps.document",
                        "modifiedTime": "2026-11-20T10:00:00Z",
                        "webViewLink": "https://docs.google.test/doc1",
                    }
                ]
            }
        if "/files/doc1?" in url:
            return {
                "id": "doc1",
                "name": "Avanti claim",
                "mimeType": "application/vnd.google-apps.document",
                "modifiedTime": "2026-11-20T10:00:00Z",
            }
        raise AssertionError(f"unexpected GET {url}")

    def fake_request(url, access_token):
        assert "/export" in url
        return b"Claim: Avanti West Coast, 20 November 2026, delayed 45 minutes.", "text/plain"

    monkeypatch.setattr(drive_connector, "_get_json", fake_get_json)
    monkeypatch.setattr(drive_connector, "_request", fake_request)

    found = client.get("/api/v1/connectors/drive/search", params={"q": "Avanti"})
    assert found.status_code == 200
    assert len(found.json()) == 1
    assert found.json()[0]["name"] == "Avanti claim"

    read = client.get("/api/v1/connectors/drive/files/doc1")
    assert read.status_code == 200
    assert "delayed 45 minutes" in read.json()["content"]
    assert read.json()["truncated"] is False


def test_drive_refuses_unreadable_types(monkeypatch) -> None:
    from app.services import drive_connector

    _configure_google(monkeypatch)
    _seed_google_token(f"{GMAIL_SCOPE} {DRIVE_SCOPE}")
    _as("user-a")

    def fake_get_json(url, access_token):
        return {
            "id": "img1",
            "name": "photo.jpg",
            "mimeType": "image/jpeg",
            "modifiedTime": "2026-11-20T10:00:00Z",
        }

    monkeypatch.setattr(drive_connector, "_get_json", fake_get_json)
    response = client.get("/api/v1/connectors/drive/files/img1")
    assert response.status_code == 400
    assert "Cannot read" in response.json()["detail"]


def test_drive_read_truncates_long_files(monkeypatch) -> None:
    from app.services import drive_connector

    _configure_google(monkeypatch)
    _seed_google_token(f"{GMAIL_SCOPE} {DRIVE_SCOPE}")
    _as("user-a")

    def fake_get_json(url, access_token):
        return {"id": "big1", "name": "notes.txt", "mimeType": "text/plain", "modifiedTime": "2026-11-20T10:00:00Z"}

    def fake_request(url, access_token):
        return b"x" * 9000, "text/plain"

    monkeypatch.setattr(drive_connector, "_get_json", fake_get_json)
    monkeypatch.setattr(drive_connector, "_request", fake_request)
    read = client.get("/api/v1/connectors/drive/files/big1")
    assert read.status_code == 200
    assert read.json()["truncated"] is True
    assert read.json()["total_chars"] == 9000
    assert len(read.json()["content"]) == 8000
