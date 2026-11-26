"""Sheets connector — read a spreadsheet's values, read-only.

Sheets rides the repo's Google OAuth, the same pattern as Drive and
YouTube: the same Google account and the same encrypted token store.
``begin`` requests the authorisation URL with the extra
``spreadsheets.readonly`` scope, and ``complete`` is the Google
connector's own callback. No separate Google client, no separate
secret. The Sheets API must be enabled on the Google Cloud project,
and the owner grants the scope at sign-in — until then the status is
honestly "not connected".

Read-only: search spreadsheets by name, list a spreadsheet's tabs,
read a tab's values. Values are capped at 8,000 characters of
serialised text (same cap as Drive) so a huge sheet cannot flood a
reply.

Search lists spreadsheets through the Drive API, so it also needs the
``drive.readonly`` scope — ``begin`` requests both scopes together,
and the doc names this. Reading values needs only
``spreadsheets.readonly``.
"""

from __future__ import annotations

import json
import logging
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from app.schemas.drive import DriveFile
from app.schemas.sheets import SheetTab, SheetValues
from app.services import google_connector
from app.services.google_connector import (
    ConnectorNotConfiguredError,
    ConnectorNotConnectedError,
    ConnectorPermissionError,
    ConnectorUpstreamError,
    GoogleAccessLevel,
)

__all__ = [
    "ConnectorNotConfiguredError",
    "ConnectorNotConnectedError",
    "ConnectorPermissionError",
    "ConnectorUpstreamError",
]

logger = logging.getLogger(__name__)

DRIVE_ROOT = "https://www.googleapis.com/drive/v3"
DRIVE_READONLY = "https://www.googleapis.com/auth/drive.readonly"
SHEETS_ROOT = "https://sheets.googleapis.com/v4/spreadsheets"
SHEETS_READONLY = "https://www.googleapis.com/auth/spreadsheets.readonly"
_SPREADSHEET_MIME = "application/vnd.google-apps.spreadsheet"
_HTTP_TIMEOUT = 20
_MAX_CHARS = 8000
_MAX_ROWS = 500


def configured() -> bool:
    """Sheets needs the Google connector configured — same client,
    same redirect URI, no extra secret."""
    return google_connector.configured()


def status(user_id: str) -> dict[str, object]:
    """Real status: Google configured + a token is stored + the
    spreadsheets.readonly scope was granted. A token without the
    scope is NOT connected for Sheets."""
    if not google_connector.configured():
        return {"configured": False, "connected": False, "scopes": []}
    google_status = google_connector.status(user_id)
    scopes = list(google_status.scopes)
    connected = bool(google_status.connected and SHEETS_READONLY in scopes)
    return {"configured": True, "connected": connected, "scopes": scopes}


def begin(user_id: str) -> str:
    if not google_connector.configured():
        raise ConnectorNotConfiguredError("Google connector is not configured")
    # Search lists spreadsheets through Drive, so both scopes are
    # requested together; reading values needs only spreadsheets.readonly.
    return google_connector.begin(
        user_id, GoogleAccessLevel.read, extra_scopes=(SHEETS_READONLY, DRIVE_READONLY)
    )


def _request(url: str, access_token: str) -> tuple[bytes, str]:
    request = Request(
        url,
        method="GET",
        headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=_HTTP_TIMEOUT) as response:
            return response.read(), response.headers.get_content_type() or ""
    except HTTPError as exc:
        logger.warning("sheets.api_http_error status=%s", exc.code)
        raise ConnectorUpstreamError(f"Sheets API request failed ({exc.code})") from exc
    except (URLError, TimeoutError, OSError) as exc:
        logger.warning("sheets.api_transport_error type=%s", type(exc).__name__)
        raise ConnectorUpstreamError("Sheets API is temporarily unavailable") from exc


def _get_json(url: str, access_token: str) -> dict[str, object]:
    raw, _content_type = _request(url, access_token)
    try:
        payload = json.loads(raw.decode("utf-8")) if raw else {}
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ConnectorUpstreamError("Sheets API returned an invalid response") from exc
    return payload if isinstance(payload, dict) else {}


def _escape_query(term: str) -> str:
    return term.replace("\\", "\\\\").replace("'", "\\'")


def _drive_file(item: dict[str, object]) -> DriveFile | None:
    if not isinstance(item, dict) or not isinstance(item.get("id"), str):
        return None
    return DriveFile(
        id=str(item["id"]),
        name=str(item.get("name", "")),
        mime_type=str(item.get("mimeType", "")),
        modified_time=str(item.get("modifiedTime", "")),
        web_view_link=str(item.get("webViewLink")) if item.get("webViewLink") else None,
    )


def search_spreadsheets(user_id: str, query: str, limit: int = 10) -> list[DriveFile]:
    """Search Drive for spreadsheets by name. An empty query lists
    the most recently modified spreadsheets."""
    access = google_connector.access_token_for_scope(user_id, DRIVE_READONLY)
    clean = (query or "").strip()
    base = f"mimeType = '{_SPREADSHEET_MIME}' and trashed = false"
    if clean:
        escaped = _escape_query(clean)
        q = f"(name contains '{escaped}') and {base}"
    else:
        q = base
    params = urlencode(
        {
            "q": q,
            "fields": "files(id,name,mimeType,modifiedTime,webViewLink)",
            "pageSize": min(max(limit, 1), 20),
            "orderBy": "modifiedTime desc",
        }
    )
    payload = _get_json(f"{DRIVE_ROOT}/files?{params}", access)
    rows: list[DriveFile] = []
    for item in payload.get("files", []) if isinstance(payload.get("files"), list) else []:
        row = _drive_file(item) if isinstance(item, dict) else None
        if row is not None:
            rows.append(row)
    return rows


def _spreadsheet_title_and_tabs(user_id: str, spreadsheet_id: str) -> tuple[str, list[SheetTab]]:
    """Title + tabs from the Sheets API itself, so reading values
    needs only the spreadsheets.readonly scope. A non-spreadsheet id
    makes the Sheets API answer 404, which surfaces as an upstream
    error — never a guessed row."""
    access = google_connector.access_token_for_scope(user_id, SHEETS_READONLY)
    payload = _get_json(
        f"{SHEETS_ROOT}/{quote(spreadsheet_id, safe='')}?fields=properties.title,sheets.properties",
        access,
    )
    props = payload.get("properties")
    title = str(props.get("title", "")) if isinstance(props, dict) else ""
    tabs: list[SheetTab] = []
    for index, sheet in enumerate(payload.get("sheets", [])):
        if not isinstance(sheet, dict):
            continue
        sheet_props = sheet.get("properties")
        tab_title = str(sheet_props.get("title", "")) if isinstance(sheet_props, dict) else ""
        if tab_title:
            tabs.append(SheetTab(title=tab_title, index=index))
    return title, tabs


def list_tabs(user_id: str, spreadsheet_id: str) -> list[SheetTab]:
    """List a spreadsheet's tabs (sheet titles), in order."""
    _title, tabs = _spreadsheet_title_and_tabs(user_id, spreadsheet_id)
    return tabs


def read_values(user_id: str, spreadsheet_id: str, range_name: str | None = None) -> SheetValues:
    """Read a tab's values. With no range given, the first tab is
    read (A1:Z500). Values come back as rows of strings, capped at
    8,000 serialised characters."""
    title, tabs = _spreadsheet_title_and_tabs(user_id, spreadsheet_id)
    if range_name:
        wanted = range_name.strip()
    elif tabs:
        wanted = f"'{tabs[0].title}'!A1:Z{_MAX_ROWS}"
    else:
        wanted = f"A1:Z{_MAX_ROWS}"
    access = google_connector.access_token_for_scope(user_id, SHEETS_READONLY)
    payload = _get_json(
        f"{SHEETS_ROOT}/{quote(spreadsheet_id, safe='')}/values/{quote(wanted, safe='')}",
        access,
    )
    raw_values = payload.get("values", [])
    rows: list[list[str]] = []
    if isinstance(raw_values, list):
        for row in raw_values[:_MAX_ROWS]:
            if isinstance(row, list):
                rows.append([str(cell) for cell in row])
    total_rows = len(rows)
    total_cells = sum(len(row) for row in rows)
    sheet_title = ""
    if "!" in wanted:
        sheet_title = wanted.split("!", 1)[0].strip("'")
    serialised = "\n".join("\t".join(row) for row in rows)
    truncated = len(serialised) > _MAX_CHARS
    if truncated:
        kept: list[list[str]] = []
        running = 0
        for row in rows:
            line = "\t".join(row)
            if running + len(line) + 1 > _MAX_CHARS:
                break
            kept.append(row)
            running += len(line) + 1
        rows = kept
    return SheetValues(
        spreadsheet=DriveFile(
            id=spreadsheet_id,
            name=title,
            mime_type=_SPREADSHEET_MIME,
        ),
        sheet_title=sheet_title,
        range=str(payload.get("range", wanted)),
        values=rows,
        truncated=truncated,
        total_rows=total_rows,
        total_cells=total_cells,
    )
