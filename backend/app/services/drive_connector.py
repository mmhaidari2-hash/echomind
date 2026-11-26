"""Drive connector — find any file and read what it says, read-only.

Drive rides the repo's Google OAuth, the same pattern as YouTube: the
same Google account and the same encrypted token store. ``begin``
requests the authorisation URL with the extra ``drive.readonly``
scope, and ``complete`` is the Google connector's own callback. No
separate Google client, no separate secret. The Drive API must be
enabled on the Google Cloud project, and the owner grants the scope
at sign-in — until then the status is honestly "not connected".

Read-only: search files by name/content, read text content. Google
Docs export as plain text; plain-text files (txt, md, json, csv) read
directly. Anything else (images, PDFs, sheets, binaries) is refused
with a clear reason, never guessed at. Content is capped at 8,000
characters so a huge document cannot flood a reply.
"""

from __future__ import annotations

import json
import logging
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from app.schemas.drive import DriveFile, DriveFileRead
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
_HTTP_TIMEOUT = 20
_MAX_CHARS = 8000

_GOOGLE_DOC = "application/vnd.google-apps.document"
_TEXT_MIME_PREFIXES = ("text/",)
_TEXT_MIME_EXACT = {
    "application/json",
    "application/xml",
    "application/javascript",
    "application/x-python",
}


def configured() -> bool:
    """Drive needs the Google connector configured — same client,
    same redirect URI, no extra secret."""
    return google_connector.configured()


def status(user_id: str) -> dict[str, object]:
    """Real status: Google configured + a token is stored + the
    drive.readonly scope was granted. A token without the scope is
    NOT connected for Drive."""
    if not google_connector.configured():
        return {"configured": False, "connected": False, "scopes": []}
    google_status = google_connector.status(user_id)
    scopes = list(google_status.scopes)
    connected = bool(google_status.connected and DRIVE_READONLY in scopes)
    return {"configured": True, "connected": connected, "scopes": scopes}


def begin(user_id: str) -> str:
    if not google_connector.configured():
        raise ConnectorNotConfiguredError("Google connector is not configured")
    return google_connector.begin(
        user_id, GoogleAccessLevel.read, extra_scopes=(DRIVE_READONLY,)
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
        logger.warning("drive.api_http_error status=%s", exc.code)
        raise ConnectorUpstreamError(f"Drive API request failed ({exc.code})") from exc
    except (URLError, TimeoutError, OSError) as exc:
        logger.warning("drive.api_transport_error type=%s", type(exc).__name__)
        raise ConnectorUpstreamError("Drive API is temporarily unavailable") from exc


def _get_json(url: str, access_token: str) -> dict[str, object]:
    raw, _content_type = _request(url, access_token)
    try:
        payload = json.loads(raw.decode("utf-8")) if raw else {}
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ConnectorUpstreamError("Drive API returned an invalid response") from exc
    return payload if isinstance(payload, dict) else {}


def _escape_query(term: str) -> str:
    return term.replace("\\", "\\\\").replace("'", "\\'")


def search_files(user_id: str, query: str, limit: int = 10) -> list[DriveFile]:
    """Search Drive by file name and full text. An empty query lists
    the most recently modified files."""
    access = google_connector.access_token_for_scope(user_id, DRIVE_READONLY)
    clean = (query or "").strip()
    if clean:
        escaped = _escape_query(clean)
        q = f"(name contains '{escaped}' or fullText contains '{escaped}') and trashed = false"
    else:
        q = "trashed = false"
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
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            continue
        rows.append(
            DriveFile(
                id=item["id"],
                name=str(item.get("name", "")),
                mime_type=str(item.get("mimeType", "")),
                modified_time=str(item.get("modifiedTime", "")),
                web_view_link=str(item.get("webViewLink")) if item.get("webViewLink") else None,
            )
        )
    return rows


def read_file(user_id: str, file_id: str) -> DriveFileRead:
    """Read a file's text content. Google Docs export as plain text;
    text files read directly. Anything else is refused, never guessed."""
    access = google_connector.access_token_for_scope(user_id, DRIVE_READONLY)
    meta = _get_json(
        f"{DRIVE_ROOT}/files/{quote(file_id, safe='')}?fields=id,name,mimeType,modifiedTime,webViewLink",
        access,
    )
    if not isinstance(meta.get("id"), str):
        raise ConnectorUpstreamError("Drive did not return that file")
    item = DriveFile(
        id=str(meta["id"]),
        name=str(meta.get("name", "")),
        mime_type=str(meta.get("mimeType", "")),
        modified_time=str(meta.get("modifiedTime", "")),
        web_view_link=str(meta.get("webViewLink")) if meta.get("webViewLink") else None,
    )
    if item.mime_type == _GOOGLE_DOC:
        raw, _ = _request(
            f"{DRIVE_ROOT}/files/{quote(file_id, safe='')}/export?mimeType=text/plain",
            access,
        )
        text = raw.decode("utf-8", errors="replace")
    elif item.mime_type.startswith(_TEXT_MIME_PREFIXES) or item.mime_type in _TEXT_MIME_EXACT:
        raw, _ = _request(f"{DRIVE_ROOT}/files/{quote(file_id, safe='')}?alt=media", access)
        text = raw.decode("utf-8", errors="replace")
    else:
        raise ValueError(
            f"Cannot read '{item.name or file_id}' as text "
            f"(type {item.mime_type or 'unknown'}). Only Google Docs and plain-text files are readable."
        )
    total = len(text)
    truncated = total > _MAX_CHARS
    return DriveFileRead(
        file=item,
        content=text[:_MAX_CHARS],
        truncated=truncated,
        total_chars=total,
    )
