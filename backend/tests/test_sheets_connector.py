"""Sheets connector tests: rides the Google token; connected only
when the spreadsheets.readonly scope was granted. Search lists
spreadsheets through Drive; reading values uses the Sheets API.
No fake states."""

from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.auth import require_user
from app.config import settings
from app.main import app

client = TestClient(app)

SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"
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


def test_sheets_fails_closed_when_google_not_configured() -> None:
    _as("user-a")
    status = client.get("/api/v1/connectors/sheets/status")
    assert status.status_code == 200
    assert status.json() == {"configured": False, "connected": False, "scopes": []}
    assert client.post("/api/v1/connectors/sheets/start").status_code == 503


def test_sheets_connected_only_with_sheets_scope(monkeypatch) -> None:
    _configure_google(monkeypatch)
    _as("user-a")
    _seed_google_token(GMAIL_SCOPE)
    status = client.get("/api/v1/connectors/sheets/status")
    assert status.json()["connected"] is False
    _seed_google_token(f"{GMAIL_SCOPE} {SHEETS_SCOPE}")
    status = client.get("/api/v1/connectors/sheets/status")
    assert status.json()["connected"] is True
    assert SHEETS_SCOPE in status.json()["scopes"]


def test_sheets_start_requests_both_scopes(monkeypatch) -> None:
    _configure_google(monkeypatch)
    _as("user-a")
    started = client.post("/api/v1/connectors/sheets/start")
    assert started.status_code == 200
    url = started.json()["authorization_url"]
    assert "accounts.google.com" in url
    assert "spreadsheets.readonly" in url
    assert "drive.readonly" in url


def test_sheets_reads_fail_closed_without_scope(monkeypatch) -> None:
    _configure_google(monkeypatch)
    _as("user-a")
    assert client.get("/api/v1/connectors/sheets/search").status_code == 409
    assert client.get("/api/v1/connectors/sheets/spreadsheets/abc").status_code == 409
    assert client.get("/api/v1/connectors/sheets/spreadsheets/abc/tabs").status_code == 409


def test_sheets_search_and_read_values(monkeypatch) -> None:
    from app.services import sheets_connector

    _configure_google(monkeypatch)
    _seed_google_token(f"{GMAIL_SCOPE} {SHEETS_SCOPE} {DRIVE_SCOPE}")
    _as("user-a")

    def fake_get_json(url, access_token):
        assert access_token == "ya29.test"
        if "/drive/v3/files?" in url:
            assert "spreadsheet" in url
            return {
                "files": [
                    {
                        "id": "sheet1",
                        "name": "Refunds 2026",
                        "mimeType": "application/vnd.google-apps.spreadsheet",
                        "modifiedTime": "2026-11-20T10:00:00Z",
                        "webViewLink": "https://docs.google.test/sheet1",
                    }
                ]
            }
        if "/v4/spreadsheets/sheet1?" in url:
            return {
                "properties": {"title": "Refunds 2026"},
                "sheets": [{"properties": {"title": "Costs"}}],
            }
        if "/v4/spreadsheets/sheet1/values/" in url:
            assert "Costs" in url
            return {
                "range": "'Costs'!A1:Z500",
                "values": [["Date", "Amount", "Status"], ["2026-11-01", "£170.00", "claimed"]],
            }
        raise AssertionError(f"unexpected GET {url}")

    monkeypatch.setattr(sheets_connector, "_get_json", fake_get_json)

    found = client.get("/api/v1/connectors/sheets/search", params={"q": "Refunds"})
    assert found.status_code == 200
    assert len(found.json()) == 1
    assert found.json()[0]["name"] == "Refunds 2026"

    tabs = client.get("/api/v1/connectors/sheets/spreadsheets/sheet1/tabs")
    assert tabs.status_code == 200
    assert tabs.json() == [{"title": "Costs", "index": 0}]

    read = client.get("/api/v1/connectors/sheets/spreadsheets/sheet1")
    assert read.status_code == 200
    body = read.json()
    assert body["sheet_title"] == "Costs"
    assert body["values"][0] == ["Date", "Amount", "Status"]
    assert body["values"][1][1] == "£170.00"
    assert body["truncated"] is False
    assert body["total_rows"] == 2


def test_sheets_read_truncates_long_sheets(monkeypatch) -> None:
    from app.services import sheets_connector

    _configure_google(monkeypatch)
    _seed_google_token(f"{GMAIL_SCOPE} {SHEETS_SCOPE} {DRIVE_SCOPE}")
    _as("user-a")

    def fake_get_json(url, access_token):
        if "/v4/spreadsheets/big1?" in url:
            return {"properties": {"title": "Big"}, "sheets": [{"properties": {"title": "Data"}}]}
        if "/v4/spreadsheets/big1/values/" in url:
            return {"range": "'Data'!A1:Z500", "values": [["x" * 100]] * 200}
        raise AssertionError(f"unexpected GET {url}")

    monkeypatch.setattr(sheets_connector, "_get_json", fake_get_json)
    read = client.get("/api/v1/connectors/sheets/spreadsheets/big1")
    assert read.status_code == 200
    body = read.json()
    assert body["truncated"] is True
    assert body["total_rows"] == 200
    serialised = "\n".join("\t".join(row) for row in body["values"])
    assert len(serialised) <= 8000
