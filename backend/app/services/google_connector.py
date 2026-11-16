"""Secure owner-scoped Google OAuth, Gmail and Calendar connector."""

from __future__ import annotations

import base64
import json
import logging
import secrets
import threading
import uuid
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings
from app.schemas.connectors import (
    CalendarEventCreate,
    CalendarEventSummary,
    GmailMessageSummary,
    GmailSendRequest,
    GoogleAccessLevel,
    GoogleConnectorStatus,
)

logger = logging.getLogger(__name__)

_STORE_PATH = Path(__file__).resolve().parents[1] / "data" / "connector_store.json"
_lock = threading.Lock()
_state: dict[str, object] = {"tokens": {}, "states": {}}

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
GMAIL_ROOT = "https://gmail.googleapis.com/gmail/v1"
CALENDAR_ROOT = "https://www.googleapis.com/calendar/v3"

GMAIL_READ = "https://www.googleapis.com/auth/gmail.readonly"
GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send"
CALENDAR_READ = "https://www.googleapis.com/auth/calendar.readonly"
CALENDAR_WRITE = "https://www.googleapis.com/auth/calendar.events"
READ_SCOPES = (GMAIL_READ, CALENDAR_READ)
WRITE_SCOPES = (GMAIL_READ, GMAIL_SEND, CALENDAR_READ, CALENDAR_WRITE)

_STATE_TTL = timedelta(minutes=10)
_HTTP_TIMEOUT = 20


class ConnectorNotConfiguredError(RuntimeError):
    pass


class ConnectorNotConnectedError(RuntimeError):
    pass


class ConnectorPermissionError(RuntimeError):
    pass


class ConnectorUpstreamError(RuntimeError):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def configured() -> bool:
    values = (
        settings.GOOGLE_CLIENT_ID,
        settings.GOOGLE_CLIENT_SECRET,
        settings.GOOGLE_REDIRECT_URI,
        settings.CONNECTOR_TOKEN_KEY,
    )
    return all(value.strip() for value in values)


def _fernet() -> Fernet:
    key = settings.CONNECTOR_TOKEN_KEY.strip().encode("ascii", errors="strict")
    if not key:
        raise ConnectorNotConfiguredError("Connector encryption is not configured")
    try:
        return Fernet(key)
    except (ValueError, TypeError) as exc:
        raise ConnectorNotConfiguredError("Connector encryption key is invalid") from exc


def _load() -> None:
    if not _STORE_PATH.exists():
        return
    try:
        raw = json.loads(_STORE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        logger.warning("connectors.store_unreadable")
        return
    if isinstance(raw, dict):
        if isinstance(raw.get("tokens"), dict):
            _state["tokens"] = raw["tokens"]
        if isinstance(raw.get("states"), dict):
            _state["states"] = raw["states"]


def _dump() -> None:
    _STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = _STORE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(_state, ensure_ascii=False, default=str), encoding="utf-8")
    tmp.replace(_STORE_PATH)


def use_store_path(path: Path) -> None:
    global _STORE_PATH
    with _lock:
        _STORE_PATH = path
        _state["tokens"] = {}
        _state["states"] = {}


_load()


def _tokens() -> dict[str, str]:
    rows = _state.setdefault("tokens", {})
    if not isinstance(rows, dict):
        rows = {}
        _state["tokens"] = rows
    return rows  # type: ignore[return-value]


def _states() -> dict[str, dict[str, str]]:
    rows = _state.setdefault("states", {})
    if not isinstance(rows, dict):
        rows = {}
        _state["states"] = rows
    return rows  # type: ignore[return-value]


def _encrypt(payload: dict[str, object]) -> str:
    raw = json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8")
    return _fernet().encrypt(raw).decode("ascii")


def _decrypt(blob: str) -> dict[str, object]:
    try:
        raw = _fernet().decrypt(blob.encode("ascii"))
        value = json.loads(raw.decode("utf-8"))
    except (InvalidToken, ValueError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ConnectorNotConnectedError("Stored connector credentials are unavailable") from exc
    if not isinstance(value, dict):
        raise ConnectorNotConnectedError("Stored connector credentials are invalid")
    return value


def _load_token(user_id: str) -> dict[str, object]:
    with _lock:
        blob = _tokens().get(user_id)
    if not isinstance(blob, str):
        raise ConnectorNotConnectedError("Google is not connected")
    return _decrypt(blob)


def _save_token(user_id: str, token: dict[str, object]) -> None:
    with _lock:
        _tokens()[user_id] = _encrypt(token)
        _dump()


def _scope_list(token: dict[str, object]) -> list[str]:
    raw = token.get("scope", "")
    if isinstance(raw, str):
        return [part for part in raw.split() if part]
    if isinstance(raw, list):
        return [str(part) for part in raw]
    return []


def status(user_id: str) -> GoogleConnectorStatus:
    if not configured():
        return GoogleConnectorStatus(configured=False, connected=False)
    try:
        token = _load_token(user_id)
    except ConnectorNotConnectedError:
        return GoogleConnectorStatus(configured=True, connected=False)
    expires_at = None
    raw_expiry = token.get("expires_at")
    if isinstance(raw_expiry, str):
        try:
            expires_at = datetime.fromisoformat(raw_expiry)
        except ValueError:
            expires_at = None
    return GoogleConnectorStatus(
        configured=True,
        connected=True,
        scopes=_scope_list(token),
        expires_at=expires_at,
    )


def begin(user_id: str, access: GoogleAccessLevel) -> str:
    if not configured():
        raise ConnectorNotConfiguredError("Google connector is not configured")
    state = secrets.token_urlsafe(32)
    expires = _now() + _STATE_TTL
    with _lock:
        states = _states()
        now = _now()
        for key, row in list(states.items()):
            try:
                if datetime.fromisoformat(row["expires_at"]) < now:
                    states.pop(key, None)
            except (KeyError, ValueError, TypeError):
                states.pop(key, None)
        states[state] = {
            "user_id": user_id,
            "access": access.value,
            "expires_at": expires.isoformat(),
        }
        _dump()

    scopes = WRITE_SCOPES if access is GoogleAccessLevel.write else READ_SCOPES
    query = urlencode(
        {
            "client_id": settings.GOOGLE_CLIENT_ID.strip(),
            "redirect_uri": settings.GOOGLE_REDIRECT_URI.strip(),
            "response_type": "code",
            "scope": " ".join(scopes),
            "access_type": "offline",
            "include_granted_scopes": "true",
            "state": state,
            "prompt": "consent",
        }
    )
    return f"{GOOGLE_AUTH_URL}?{query}"


def _post_form(url: str, form: dict[str, str]) -> dict[str, object]:
    request = Request(
        url,
        data=urlencode(form).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urlopen(request, timeout=_HTTP_TIMEOUT) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        logger.warning("google.oauth_http_error status=%s", exc.code)
        raise ConnectorUpstreamError(f"Google OAuth request failed ({exc.code})") from exc
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        logger.warning("google.oauth_transport_error type=%s", type(exc).__name__)
        raise ConnectorUpstreamError("Google OAuth is temporarily unavailable") from exc
    if not isinstance(payload, dict):
        raise ConnectorUpstreamError("Google OAuth returned an invalid response")
    return payload


def complete(state: str, code: str) -> str:
    if not configured():
        raise ConnectorNotConfiguredError("Google connector is not configured")
    with _lock:
        row = _states().pop(state, None)
        _dump()
    if not isinstance(row, dict):
        raise ConnectorPermissionError("OAuth state is invalid or already used")
    try:
        expires = datetime.fromisoformat(row["expires_at"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ConnectorPermissionError("OAuth state is invalid") from exc
    if expires < _now():
        raise ConnectorPermissionError("OAuth state expired")
    user_id = row.get("user_id", "")
    if not user_id:
        raise ConnectorPermissionError("OAuth state has no owner")

    payload = _post_form(
        GOOGLE_TOKEN_URL,
        {
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID.strip(),
            "client_secret": settings.GOOGLE_CLIENT_SECRET.strip(),
            "redirect_uri": settings.GOOGLE_REDIRECT_URI.strip(),
            "grant_type": "authorization_code",
        },
    )
    access_token = payload.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise ConnectorUpstreamError("Google did not return an access token")

    existing: dict[str, object] = {}
    try:
        existing = _load_token(user_id)
    except ConnectorNotConnectedError:
        pass
    refresh = payload.get("refresh_token") or existing.get("refresh_token")
    if not isinstance(refresh, str) or not refresh:
        raise ConnectorUpstreamError("Google did not return a refresh token")

    expires_in = int(payload.get("expires_in", 3600))
    scopes = payload.get("scope") or existing.get("scope") or ""
    token = {
        "access_token": access_token,
        "refresh_token": refresh,
        "scope": scopes,
        "expires_at": (_now() + timedelta(seconds=max(60, expires_in))).isoformat(),
    }
    _save_token(user_id, token)
    return user_id


def _refresh(user_id: str, token: dict[str, object]) -> dict[str, object]:
    refresh_token = token.get("refresh_token")
    if not isinstance(refresh_token, str) or not refresh_token:
        raise ConnectorNotConnectedError("Google refresh token is unavailable")
    payload = _post_form(
        GOOGLE_TOKEN_URL,
        {
            "client_id": settings.GOOGLE_CLIENT_ID.strip(),
            "client_secret": settings.GOOGLE_CLIENT_SECRET.strip(),
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
    )
    access = payload.get("access_token")
    if not isinstance(access, str) or not access:
        raise ConnectorUpstreamError("Google did not refresh the access token")
    expires_in = int(payload.get("expires_in", 3600))
    token["access_token"] = access
    token["expires_at"] = (_now() + timedelta(seconds=max(60, expires_in))).isoformat()
    if isinstance(payload.get("scope"), str):
        token["scope"] = payload["scope"]
    _save_token(user_id, token)
    return token


def _access_token(user_id: str, required_scope: str | None = None) -> str:
    token = _load_token(user_id)
    scopes = set(_scope_list(token))
    if required_scope and required_scope not in scopes:
        raise ConnectorPermissionError("Google permission has not been granted for this action")
    expires_raw = token.get("expires_at")
    refresh_needed = True
    if isinstance(expires_raw, str):
        try:
            refresh_needed = datetime.fromisoformat(expires_raw) <= _now() + timedelta(seconds=60)
        except ValueError:
            refresh_needed = True
    if refresh_needed:
        token = _refresh(user_id, token)
    access = token.get("access_token")
    if not isinstance(access, str) or not access:
        raise ConnectorNotConnectedError("Google access token is unavailable")
    return access


def _api_json(
    user_id: str,
    method: str,
    url: str,
    *,
    required_scope: str,
    body: dict[str, object] | None = None,
) -> dict[str, object]:
    access = _access_token(user_id, required_scope)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {access}",
            "Accept": "application/json",
            **({"Content-Type": "application/json"} if data is not None else {}),
        },
    )
    try:
        with urlopen(request, timeout=_HTTP_TIMEOUT) as response:
            raw = response.read()
            payload = json.loads(raw.decode("utf-8")) if raw else {}
    except HTTPError as exc:
        logger.warning("google.api_http_error status=%s", exc.code)
        raise ConnectorUpstreamError(f"Google API request failed ({exc.code})") from exc
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        logger.warning("google.api_transport_error type=%s", type(exc).__name__)
        raise ConnectorUpstreamError("Google API is temporarily unavailable") from exc
    return payload if isinstance(payload, dict) else {}


def recent_gmail(user_id: str, limit: int = 10) -> list[GmailMessageSummary]:
    query = urlencode({"maxResults": min(max(limit, 1), 20), "q": "newer_than:30d"})
    listing = _api_json(
        user_id,
        "GET",
        f"{GMAIL_ROOT}/users/me/messages?{query}",
        required_scope=GMAIL_READ,
    )
    rows: list[GmailMessageSummary] = []
    for ref in listing.get("messages", []) if isinstance(listing.get("messages"), list) else []:
        if not isinstance(ref, dict) or not isinstance(ref.get("id"), str):
            continue
        message_id = ref["id"]
        detail_query = urlencode(
            [
                ("format", "metadata"),
                ("metadataHeaders", "Subject"),
                ("metadataHeaders", "From"),
                ("metadataHeaders", "Date"),
            ]
        )
        detail = _api_json(
            user_id,
            "GET",
            f"{GMAIL_ROOT}/users/me/messages/{message_id}?{detail_query}",
            required_scope=GMAIL_READ,
        )
        headers: dict[str, str] = {}
        payload = detail.get("payload")
        if isinstance(payload, dict) and isinstance(payload.get("headers"), list):
            for header in payload["headers"]:
                if isinstance(header, dict) and isinstance(header.get("name"), str):
                    headers[header["name"].lower()] = str(header.get("value", ""))
        rows.append(
            GmailMessageSummary(
                id=message_id,
                thread_id=str(detail.get("threadId", "")) or None,
                subject=headers.get("subject", ""),
                sender=headers.get("from", ""),
                date=headers.get("date", ""),
                snippet=str(detail.get("snippet", ""))[:500],
            )
        )
    return rows


def upcoming_calendar(user_id: str, limit: int = 10) -> list[CalendarEventSummary]:
    time_min = _now().isoformat().replace("+00:00", "Z")
    query = urlencode(
        {
            "timeMin": time_min,
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": min(max(limit, 1), 20),
        }
    )
    payload = _api_json(
        user_id,
        "GET",
        f"{CALENDAR_ROOT}/calendars/primary/events?{query}",
        required_scope=CALENDAR_READ,
    )
    rows: list[CalendarEventSummary] = []
    items = payload.get("items")
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            continue
        start = item.get("start") if isinstance(item.get("start"), dict) else {}
        end = item.get("end") if isinstance(item.get("end"), dict) else {}
        rows.append(
            CalendarEventSummary(
                id=item["id"],
                summary=str(item.get("summary", "")),
                start=str(start.get("dateTime") or start.get("date") or ""),
                end=str(end.get("dateTime") or end.get("date") or ""),
                html_link=str(item.get("htmlLink")) if item.get("htmlLink") else None,
            )
        )
    return rows


def send_gmail(user_id: str, payload: GmailSendRequest) -> dict[str, object]:
    message = EmailMessage()
    message["To"] = payload.to
    message["Subject"] = payload.subject
    message.set_content(payload.body)
    encoded = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii").rstrip("=")
    return _api_json(
        user_id,
        "POST",
        f"{GMAIL_ROOT}/users/me/messages/send",
        required_scope=GMAIL_SEND,
        body={"raw": encoded},
    )


def create_calendar_event(user_id: str, payload: CalendarEventCreate) -> dict[str, object]:
    return _api_json(
        user_id,
        "POST",
        f"{CALENDAR_ROOT}/calendars/primary/events",
        required_scope=CALENDAR_WRITE,
        body={
            "summary": payload.summary,
            "description": payload.description,
            "start": {"dateTime": payload.start, "timeZone": payload.timezone},
            "end": {"dateTime": payload.end, "timeZone": payload.timezone},
        },
    )


def disconnect(user_id: str) -> None:
    try:
        token = _load_token(user_id)
        refresh = token.get("refresh_token")
        if isinstance(refresh, str) and refresh:
            try:
                _post_form(GOOGLE_REVOKE_URL, {"token": refresh})
            except ConnectorUpstreamError:
                logger.warning("google.revoke_failed")
    finally:
        with _lock:
            _tokens().pop(user_id, None)
            _dump()
