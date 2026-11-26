"""Secure owner-scoped Instagram connector (Instagram API with Instagram Login).

Mirrors the Google connector's structure: encrypted per-user token store,
10-minute OAuth state, fail-closed errors, no credentials in logs.
Read-only: profile + media. No publishing, no messaging, no writes.

Live calls are against Meta's published Instagram API contract
(Instagram Login, permission ``instagram_business_basic``). The flow is
unverified live until Mahdi creates a Meta app and supplies
INSTAGRAM_CLIENT_ID / INSTAGRAM_CLIENT_SECRET / INSTAGRAM_REDIRECT_URI.
"""

from __future__ import annotations

import json
import logging
import secrets
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings
from app.schemas.connectors import InstagramMediaItem, InstagramProfile

logger = logging.getLogger(__name__)

_STORE_PATH = Path(__file__).resolve().parents[1] / "data" / "instagram_store.json"
_lock = threading.Lock()
_state: dict[str, object] = {"tokens": {}, "states": {}}

INSTAGRAM_AUTH_URL = "https://www.instagram.com/oauth/authorize"
INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token"
INSTAGRAM_GRAPH_URL = "https://graph.instagram.com"
INSTAGRAM_SCOPE = "instagram_business_basic"

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
        settings.INSTAGRAM_CLIENT_ID,
        settings.INSTAGRAM_CLIENT_SECRET,
        settings.INSTAGRAM_REDIRECT_URI,
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
        logger.warning("instagram.store_unreadable")
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
        raise ConnectorNotConnectedError("Stored Instagram credentials are unavailable") from exc
    if not isinstance(value, dict):
        raise ConnectorNotConnectedError("Stored Instagram credentials are invalid")
    return value


def _load_token(user_id: str) -> dict[str, object]:
    with _lock:
        blob = _tokens().get(user_id)
    if not isinstance(blob, str):
        raise ConnectorNotConnectedError("Instagram is not connected")
    return _decrypt(blob)


def _save_token(user_id: str, token: dict[str, object]) -> None:
    with _lock:
        _tokens()[user_id] = _encrypt(token)
        _dump()


def status(user_id: str) -> dict[str, object]:
    """Real status: configured + whether a token is stored (+ username
    captured at connect time). No live probe here — same definition as
    the Google connector; profile/media reads prove liveness on demand."""
    if not configured():
        return {"configured": False, "connected": False, "username": None}
    try:
        token = _load_token(user_id)
    except ConnectorNotConnectedError:
        return {"configured": True, "connected": False, "username": None}
    username = token.get("username")
    return {
        "configured": True,
        "connected": True,
        "username": username if isinstance(username, str) else None,
    }


def begin(user_id: str) -> str:
    if not configured():
        raise ConnectorNotConfiguredError("Instagram connector is not configured")
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
        states[state] = {"user_id": user_id, "expires_at": expires.isoformat()}
        _dump()
    query = urlencode(
        {
            "client_id": settings.INSTAGRAM_CLIENT_ID.strip(),
            "redirect_uri": settings.INSTAGRAM_REDIRECT_URI.strip(),
            "scope": INSTAGRAM_SCOPE,
            "response_type": "code",
            "state": state,
        }
    )
    return f"{INSTAGRAM_AUTH_URL}?{query}"


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
        logger.warning("instagram.oauth_http_error status=%s", exc.code)
        raise ConnectorUpstreamError(f"Instagram OAuth request failed ({exc.code})") from exc
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        logger.warning("instagram.oauth_transport_error type=%s", type(exc).__name__)
        raise ConnectorUpstreamError("Instagram OAuth is temporarily unavailable") from exc
    if not isinstance(payload, dict):
        raise ConnectorUpstreamError("Instagram OAuth returned an invalid response")
    return payload


def _get_json(url: str, params: dict[str, str]) -> dict[str, object]:
    full = f"{url}?{urlencode(params)}"
    request = Request(full, method="GET", headers={"Accept": "application/json"})
    try:
        with urlopen(request, timeout=_HTTP_TIMEOUT) as response:
            raw = response.read()
            payload = json.loads(raw.decode("utf-8")) if raw else {}
    except HTTPError as exc:
        logger.warning("instagram.api_http_error status=%s", exc.code)
        raise ConnectorUpstreamError(f"Instagram API request failed ({exc.code})") from exc
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        logger.warning("instagram.api_transport_error type=%s", type(exc).__name__)
        raise ConnectorUpstreamError("Instagram API is temporarily unavailable") from exc
    return payload if isinstance(payload, dict) else {}


def _exchange_long_lived(short_token: str) -> dict[str, object]:
    return _get_json(
        f"{INSTAGRAM_GRAPH_URL}/access_token",
        {
            "grant_type": "ig_exchange_token",
            "client_secret": settings.INSTAGRAM_CLIENT_SECRET.strip(),
            "access_token": short_token,
        },
    )


def _profile_payload(access_token: str) -> dict[str, object]:
    return _get_json(
        f"{INSTAGRAM_GRAPH_URL}/me",
        {
            "fields": "id,username,account_type,media_count",
            "access_token": access_token,
        },
    )


def complete(state: str, code: str) -> str:
    if not configured():
        raise ConnectorNotConfiguredError("Instagram connector is not configured")
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
        INSTAGRAM_TOKEN_URL,
        {
            "client_id": settings.INSTAGRAM_CLIENT_ID.strip(),
            "client_secret": settings.INSTAGRAM_CLIENT_SECRET.strip(),
            "grant_type": "authorization_code",
            "redirect_uri": settings.INSTAGRAM_REDIRECT_URI.strip(),
            "code": code,
        },
    )
    short_token = payload.get("access_token")
    if not isinstance(short_token, str) or not short_token:
        raise ConnectorUpstreamError("Instagram did not return an access token")
    ig_user_id = payload.get("user_id")

    long_payload = _exchange_long_lived(short_token)
    access_token = long_payload.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise ConnectorUpstreamError("Instagram did not return a long-lived token")
    expires_in = int(long_payload.get("expires_in", 60 * 24 * 3600))

    username: str | None = None
    try:
        profile = _profile_payload(access_token)
        if isinstance(profile.get("username"), str):
            username = profile["username"]
    except ConnectorUpstreamError:
        logger.warning("instagram.profile_probe_failed")

    token: dict[str, object] = {
        "access_token": access_token,
        "ig_user_id": str(ig_user_id) if ig_user_id is not None else None,
        "username": username,
        "scope": INSTAGRAM_SCOPE,
        "expires_at": (_now() + timedelta(seconds=max(60, expires_in))).isoformat(),
    }
    _save_token(user_id, token)
    return user_id


def _refresh(user_id: str, token: dict[str, object]) -> dict[str, object]:
    access = token.get("access_token")
    if not isinstance(access, str) or not access:
        raise ConnectorNotConnectedError("Instagram access token is unavailable")
    payload = _get_json(
        f"{INSTAGRAM_GRAPH_URL}/refresh_access_token",
        {"grant_type": "ig_refresh_token", "access_token": access},
    )
    new_access = payload.get("access_token")
    if not isinstance(new_access, str) or not new_access:
        raise ConnectorUpstreamError("Instagram did not refresh the access token")
    expires_in = int(payload.get("expires_in", 60 * 24 * 3600))
    token["access_token"] = new_access
    token["expires_at"] = (_now() + timedelta(seconds=max(60, expires_in))).isoformat()
    _save_token(user_id, token)
    return token


def _access_token(user_id: str) -> str:
    token = _load_token(user_id)
    expires_raw = token.get("expires_at")
    refresh_needed = True
    if isinstance(expires_raw, str):
        try:
            refresh_needed = datetime.fromisoformat(expires_raw) <= _now() + timedelta(days=1)
        except ValueError:
            refresh_needed = True
    if refresh_needed:
        token = _refresh(user_id, token)
    access = token.get("access_token")
    if not isinstance(access, str) or not access:
        raise ConnectorNotConnectedError("Instagram access token is unavailable")
    return access


def profile(user_id: str) -> InstagramProfile:
    payload = _profile_payload(_access_token(user_id))
    if payload.get("error"):
        raise ConnectorUpstreamError("Instagram could not read the profile")
    return InstagramProfile(
        id=str(payload.get("id", "")),
        username=str(payload.get("username", "")),
        account_type=str(payload.get("account_type", "")),
        media_count=int(payload.get("media_count", 0) or 0),
    )


def recent_media(user_id: str, limit: int = 10) -> list[InstagramMediaItem]:
    payload = _get_json(
        f"{INSTAGRAM_GRAPH_URL}/me/media",
        {
            "fields": "id,caption,media_type,media_url,permalink,timestamp",
            "limit": str(min(max(limit, 1), 20)),
            "access_token": _access_token(user_id),
        },
    )
    if payload.get("error"):
        raise ConnectorUpstreamError("Instagram could not read media")
    rows: list[InstagramMediaItem] = []
    items = payload.get("data")
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            continue
        rows.append(
            InstagramMediaItem(
                id=item["id"],
                caption=item.get("caption") if isinstance(item.get("caption"), str) else None,
                media_type=str(item.get("media_type", "")),
                media_url=item.get("media_url") if isinstance(item.get("media_url"), str) else None,
                permalink=item.get("permalink") if isinstance(item.get("permalink"), str) else None,
                timestamp=str(item.get("timestamp", "")),
            )
        )
    return rows


def disconnect(user_id: str) -> None:
    with _lock:
        _tokens().pop(user_id, None)
        _dump()
