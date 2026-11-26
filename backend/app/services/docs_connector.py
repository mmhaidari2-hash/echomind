"""Docs connector — find any document and read what it says, read-only.

Docs rides the repo's Google OAuth, the same pattern as Drive and
Sheets: the same Google account and the same encrypted token store.
``begin`` requests the authorisation URL with the extra
``documents.readonly`` scope, and ``complete`` is the Google
connector's own callback. No separate Google client, no separate
secret. The Docs API must be enabled on the Google Cloud project,
and the owner grants the scope at sign-in — until then the status is
honestly "not connected".

Read-only: search documents by name, read a document's text through
the Docs API (paragraphs and table cells, in order). This is the
scope the hub's Docs app grants — the Drive connector reads Docs
too, through Drive export, but only this connector consumes the
``documents.readonly`` scope. Content is capped at 8,000 characters
(same cap as Drive) so a huge document cannot flood a reply.

Search lists documents through the Drive API, so it also needs the
``drive.readonly`` scope — ``begin`` requests both scopes together,
and the doc names this. Reading a document needs only
``documents.readonly``.
"""

from __future__ import annotations

import json
import logging
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from app.schemas.docs import DocRead
from app.schemas.drive import DriveFile
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
DOCS_ROOT = "https://docs.googleapis.com/v1/documents"
DOCS_READONLY = "https://www.googleapis.com/auth/documents.readonly"
_DOCUMENT_MIME = "application/vnd.google-apps.document"
_HTTP_TIMEOUT = 20
_MAX_CHARS = 8000


def configured() -> bool:
    """Docs needs the Google connector configured — same client,
    same redirect URI, no extra secret."""
    return google_connector.configured()


def status(user_id: str) -> dict[str, object]:
    """Real status: Google configured + a token is stored + the
    documents.readonly scope was granted. A token without the scope
    is NOT connected for Docs."""
    if not google_connector.configured():
        return {"configured": False, "connected": False, "scopes": []}
    google_status = google_connector.status(user_id)
    scopes = list(google_status.scopes)
    connected = bool(google_status.connected and DOCS_READONLY in scopes)
    return {"configured": True, "connected": connected, "scopes": scopes}


def begin(user_id: str) -> str:
    if not google_connector.configured():
        raise ConnectorNotConfiguredError("Google connector is not configured")
    # Search lists documents through Drive, so both scopes are
    # requested together; reading needs only documents.readonly.
    return google_connector.begin(
        user_id, GoogleAccessLevel.read, extra_scopes=(DOCS_READONLY, DRIVE_READONLY)
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
        logger.warning("docs.api_http_error status=%s", exc.code)
        raise ConnectorUpstreamError(f"Docs API request failed ({exc.code})") from exc
    except (URLError, TimeoutError, OSError) as exc:
        logger.warning("docs.api_transport_error type=%s", type(exc).__name__)
        raise ConnectorUpstreamError("Docs API is temporarily unavailable") from exc


def _get_json(url: str, access_token: str) -> dict[str, object]:
    raw, _content_type = _request(url, access_token)
    try:
        payload = json.loads(raw.decode("utf-8")) if raw else {}
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ConnectorUpstreamError("Docs API returned an invalid response") from exc
    return payload if isinstance(payload, dict) else {}


def _escape_query(term: str) -> str:
    return term.replace("\\", "\\\\").replace("'", "\\'")


def search_documents(user_id: str, query: str, limit: int = 10) -> list[DriveFile]:
    """Search Drive for Google Docs by name. An empty query lists
    the most recently modified documents."""
    access = google_connector.access_token_for_scope(user_id, DRIVE_READONLY)
    clean = (query or "").strip()
    base = f"mimeType = '{_DOCUMENT_MIME}' and trashed = false"
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
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            continue
        rows.append(
            DriveFile(
                id=str(item["id"]),
                name=str(item.get("name", "")),
                mime_type=str(item.get("mimeType", "")),
                modified_time=str(item.get("modifiedTime", "")),
                web_view_link=str(item.get("webViewLink")) if item.get("webViewLink") else None,
            )
        )
    return rows


def _paragraph_text(paragraph: dict[str, object]) -> str:
    parts: list[str] = []
    for element in paragraph.get("elements", []) if isinstance(paragraph.get("elements"), list) else []:
        if not isinstance(element, dict):
            continue
        text_run = element.get("textRun")
        if isinstance(text_run, dict) and isinstance(text_run.get("content"), str):
            parts.append(str(text_run["content"]))
    return "".join(parts)


def _structural_text(element: dict[str, object]) -> str:
    """Text of one structural element, in order: a paragraph's runs,
    or a table's cells (each cell's paragraphs, in reading order)."""
    if not isinstance(element, dict):
        return ""
    paragraph = element.get("paragraph")
    if isinstance(paragraph, dict):
        return _paragraph_text(paragraph)
    table = element.get("table")
    if isinstance(table, dict):
        chunks: list[str] = []
        for row in table.get("tableRows", []) if isinstance(table.get("tableRows"), list) else []:
            if not isinstance(row, dict):
                continue
            for cell in row.get("tableCells", []) if isinstance(row.get("tableCells"), list) else []:
                if not isinstance(cell, dict):
                    continue
                for child in cell.get("content", []) if isinstance(cell.get("content"), list) else []:
                    if isinstance(child, dict):
                        chunks.append(_structural_text(child))
        return "\n".join(chunk for chunk in chunks if chunk)
    return ""


def _document_text(document: dict[str, object]) -> str:
    body = document.get("body")
    if not isinstance(body, dict):
        return ""
    chunks: list[str] = []
    for element in body.get("content", []) if isinstance(body.get("content"), list) else []:
        if isinstance(element, dict):
            chunks.append(_structural_text(element))
    return "".join(chunks)


def read_document(user_id: str, document_id: str) -> DocRead:
    """Read a Google Doc's text through the Docs API — paragraphs
    and table cells, in order, capped at 8,000 characters."""
    access = google_connector.access_token_for_scope(user_id, DOCS_READONLY)
    payload = _get_json(
        f"{DOCS_ROOT}/{quote(document_id, safe='')}?fields=title,body",
        access,
    )
    title = str(payload.get("title", "")) if isinstance(payload.get("title"), str) else ""
    text = _document_text(payload)
    total = len(text)
    truncated = total > _MAX_CHARS
    return DocRead(
        file=DriveFile(
            id=document_id,
            name=title,
            mime_type=_DOCUMENT_MIME,
        ),
        content=text[:_MAX_CHARS],
        truncated=truncated,
        total_chars=total,
    )
