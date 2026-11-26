"""Docs connector tests: rides the Google token; connected only
when the documents.readonly scope was granted. Search lists
documents through Drive; reading uses the Docs API (paragraphs and
table cells, in order). No fake states."""

from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.auth import require_user
from app.config import settings
from app.main import app

client = TestClient(app)

DOCS_SCOPE = "https://www.googleapis.com/auth/documents.readonly"
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


def test_docs_fails_closed_when_google_not_configured() -> None:
    _as("user-a")
    status = client.get("/api/v1/connectors/docs/status")
    assert status.status_code == 200
    assert status.json() == {"configured": False, "connected": False, "scopes": []}
    assert client.post("/api/v1/connectors/docs/start").status_code == 503


def test_docs_connected_only_with_docs_scope(monkeypatch) -> None:
    _configure_google(monkeypatch)
    _as("user-a")
    _seed_google_token(GMAIL_SCOPE)
    status = client.get("/api/v1/connectors/docs/status")
    assert status.json()["connected"] is False
    _seed_google_token(f"{GMAIL_SCOPE} {DOCS_SCOPE}")
    status = client.get("/api/v1/connectors/docs/status")
    assert status.json()["connected"] is True
    assert DOCS_SCOPE in status.json()["scopes"]


def test_docs_start_requests_both_scopes(monkeypatch) -> None:
    _configure_google(monkeypatch)
    _as("user-a")
    started = client.post("/api/v1/connectors/docs/start")
    assert started.status_code == 200
    url = started.json()["authorization_url"]
    assert "accounts.google.com" in url
    assert "documents.readonly" in url
    assert "drive.readonly" in url


def test_docs_reads_fail_closed_without_scope(monkeypatch) -> None:
    _configure_google(monkeypatch)
    _as("user-a")
    assert client.get("/api/v1/connectors/docs/search").status_code == 409
    assert client.get("/api/v1/connectors/docs/documents/abc").status_code == 409


def _doc_payload(title: str, body_text: str) -> dict:
    return {
        "title": title,
        "body": {
            "content": [
                {
                    "paragraph": {
                        "elements": [{"textRun": {"content": body_text}}],
                    }
                },
                {
                    "table": {
                        "tableRows": [
                            {
                                "tableCells": [
                                    {
                                        "content": [
                                            {
                                                "paragraph": {
                                                    "elements": [{"textRun": {"content": "Cell A"}}]
                                                }
                                            }
                                        ]
                                    },
                                    {
                                        "content": [
                                            {
                                                "paragraph": {
                                                    "elements": [{"textRun": {"content": "Cell B"}}]
                                                }
                                            }
                                        ]
                                    },
                                ]
                            }
                        ]
                    }
                },
            ]
        },
    }


def test_docs_search_and_read_document(monkeypatch) -> None:
    from app.services import docs_connector

    _configure_google(monkeypatch)
    _seed_google_token(f"{GMAIL_SCOPE} {DOCS_SCOPE} {DRIVE_SCOPE}")
    _as("user-a")

    def fake_get_json(url, access_token):
        assert access_token == "ya29.test"
        if "/drive/v3/files?" in url:
            assert "document" in url
            return {
                "files": [
                    {
                        "id": "doc1",
                        "name": "DCBL dispute letter",
                        "mimeType": "application/vnd.google-apps.document",
                        "modifiedTime": "2026-11-20T10:00:00Z",
                        "webViewLink": "https://docs.google.test/doc1",
                    }
                ]
            }
        if "/v1/documents/doc1" in url:
            return _doc_payload("DCBL dispute letter", "Dear DCBL, I dispute this charge. ")
        raise AssertionError(f"unexpected GET {url}")

    monkeypatch.setattr(docs_connector, "_get_json", fake_get_json)

    found = client.get("/api/v1/connectors/docs/search", params={"q": "DCBL"})
    assert found.status_code == 200
    assert len(found.json()) == 1
    assert found.json()[0]["name"] == "DCBL dispute letter"

    read = client.get("/api/v1/connectors/docs/documents/doc1")
    assert read.status_code == 200
    body = read.json()
    assert "Dear DCBL" in body["content"]
    assert "Cell A" in body["content"]
    assert "Cell B" in body["content"]
    assert body["truncated"] is False


def test_docs_read_truncates_long_documents(monkeypatch) -> None:
    from app.services import docs_connector

    _configure_google(monkeypatch)
    _seed_google_token(f"{GMAIL_SCOPE} {DOCS_SCOPE} {DRIVE_SCOPE}")
    _as("user-a")

    def fake_get_json(url, access_token):
        return _doc_payload("Big", "x" * 9000)

    monkeypatch.setattr(docs_connector, "_get_json", fake_get_json)
    read = client.get("/api/v1/connectors/docs/documents/big1")
    assert read.status_code == 200
    body = read.json()
    assert body["truncated"] is True
    # 9,000 x's + the table cells "Cell A" / "Cell B" joined by "\n".
    assert body["total_chars"] == 9013
    assert len(body["content"]) == 8000
