"""Secure owner-scoped UK Open Banking connector via TrueLayer.

Mirrors the Google connector's structure: encrypted per-user token store,
10-minute OAuth state, fail-closed errors, no credentials in logs.

READ-ONLY by design: accounts, balances and transactions, behind the
owner's explicit consent in the bank's own TrueLayer authorisation flow.
There is no payment function in this module and no payment endpoint —
moving money needs a separate, explicitly confirmed flow that is not
built here. EchoMind never captures or stores a bank login.

TrueLayer is the wired provider (UK-first, sandbox available, REST
OAuth2). The flow is unverified live until Mahdi creates a TrueLayer
account and supplies TRUELAYER_CLIENT_ID / TRUELAYER_CLIENT_SECRET /
TRUELAYER_REDIRECT_URI. TRUELAYER_ENV is "sandbox" by default; set it
to "live" only for real bank consent.
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
from app.schemas.connectors import BankAccount, BankTransaction

logger = logging.getLogger(__name__)

_STORE_PATH = Path(__file__).resolve().parents[1] / "data" / "truelayer_store.json"
_lock = threading.Lock()
_state: dict[str, object] = {"tokens": {}, "states": {}}

_PROVIDER = "TrueLayer"
_SCOPE = "info accounts balance transactions"
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


def environment() -> str:
    return "live" if settings.TRUELAYER_ENV.strip().lower() == "live" else "sandbox"


def _auth_base() -> str:
    return "https://auth.truelayer.com" if environment() == "live" else "https://auth.truelayer-sandbox.com"


def _api_base() -> str:
    return "https://api.truelayer.com" if environment() == "live" else "https://api.truelayer-sandbox.com"


def configured() -> bool:
    values = (
        settings.TRUELAYER_CLIENT_ID,
        settings.TRUELAYER_CLIENT_SECRET,
        settings.TRUELAYER_REDIRECT_URI,
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
        logger.warning("truelayer.store_unreadable")
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
        raise ConnectorNotConnectedError("Stored bank credentials are unavailable") from exc
    if not isinstance(value, dict):
        raise ConnectorNotConnectedError("Stored bank credentials are invalid")
    return value


def _load_token(user_id: str) -> dict[str, object]:
    with _lock:
        blob = _tokens().get(user_id)
    if not isinstance(blob, str):
        raise ConnectorNotConnectedError("Bank is not connected")
    return _decrypt(blob)


def _save_token(user_id: str, token: dict[str, object]) -> None:
    with _lock:
        _tokens()[user_id] = _encrypt(token)
        _dump()


def status(user_id: str) -> dict[str, object]:
    """Real status: configured + whether a bank consent token is stored.
    Same definition as the Google connector; accounts/transactions reads
    prove liveness on demand."""
    if not configured():
        return {"configured": False, "connected": False, "provider": _PROVIDER, "environment": environment()}
    try:
        _load_token(user_id)
    except ConnectorNotConnectedError:
        return {"configured": True, "connected": False, "provider": _PROVIDER, "environment": environment()}
    return {"configured": True, "connected": True, "provider": _PROVIDER, "environment": environment()}


def begin(user_id: str) -> str:
    if not configured():
        raise ConnectorNotConfiguredError("Bank connector is not configured")
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
            "response_type": "code",
            "client_id": settings.TRUELAYER_CLIENT_ID.strip(),
            "scope": _SCOPE,
            "redirect_uri": settings.TRUELAYER_REDIRECT_URI.strip(),
            "state": state,
        }
    )
    return f"{_auth_base()}/?{query}"


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
        logger.warning("truelayer.oauth_http_error status=%s", exc.code)
        raise ConnectorUpstreamError(f"TrueLayer OAuth request failed ({exc.code})") from exc
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        logger.warning("truelayer.oauth_transport_error type=%s", type(exc).__name__)
        raise ConnectorUpstreamError("TrueLayer OAuth is temporarily unavailable") from exc
    if not isinstance(payload, dict):
        raise ConnectorUpstreamError("TrueLayer OAuth returned an invalid response")
    return payload


def _get_json(url: str, access_token: str) -> dict[str, object]:
    request = Request(
        url,
        method="GET",
        headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=_HTTP_TIMEOUT) as response:
            raw = response.read()
            payload = json.loads(raw.decode("utf-8")) if raw else {}
    except HTTPError as exc:
        logger.warning("truelayer.api_http_error status=%s", exc.code)
        raise ConnectorUpstreamError(f"TrueLayer API request failed ({exc.code})") from exc
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        logger.warning("truelayer.api_transport_error type=%s", type(exc).__name__)
        raise ConnectorUpstreamError("TrueLayer API is temporarily unavailable") from exc
    return payload if isinstance(payload, dict) else {}


def complete(state: str, code: str) -> str:
    if not configured():
        raise ConnectorNotConfiguredError("Bank connector is not configured")
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
        f"{_auth_base()}/connect/token",
        {
            "grant_type": "authorization_code",
            "client_id": settings.TRUELAYER_CLIENT_ID.strip(),
            "client_secret": settings.TRUELAYER_CLIENT_SECRET.strip(),
            "code": code,
            "redirect_uri": settings.TRUELAYER_REDIRECT_URI.strip(),
        },
    )
    access_token = payload.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise ConnectorUpstreamError("TrueLayer did not return an access token")
    refresh = payload.get("refresh_token")
    if not isinstance(refresh, str) or not refresh:
        raise ConnectorUpstreamError("TrueLayer did not return a refresh token")
    expires_in = int(payload.get("expires_in", 3600))
    token: dict[str, object] = {
        "access_token": access_token,
        "refresh_token": refresh,
        "scope": payload.get("scope") or _SCOPE,
        "expires_at": (_now() + timedelta(seconds=max(60, expires_in))).isoformat(),
    }
    _save_token(user_id, token)
    return user_id


def _refresh(user_id: str, token: dict[str, object]) -> dict[str, object]:
    refresh_token = token.get("refresh_token")
    if not isinstance(refresh_token, str) or not refresh_token:
        raise ConnectorNotConnectedError("Bank refresh token is unavailable")
    payload = _post_form(
        f"{_auth_base()}/connect/token",
        {
            "grant_type": "refresh_token",
            "client_id": settings.TRUELAYER_CLIENT_ID.strip(),
            "client_secret": settings.TRUELAYER_CLIENT_SECRET.strip(),
            "refresh_token": refresh_token,
        },
    )
    access = payload.get("access_token")
    if not isinstance(access, str) or not access:
        raise ConnectorUpstreamError("TrueLayer did not refresh the access token")
    expires_in = int(payload.get("expires_in", 3600))
    token["access_token"] = access
    token["expires_at"] = (_now() + timedelta(seconds=max(60, expires_in))).isoformat()
    if isinstance(payload.get("refresh_token"), str):
        token["refresh_token"] = payload["refresh_token"]
    _save_token(user_id, token)
    return token


def _access_token(user_id: str) -> str:
    token = _load_token(user_id)
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
        raise ConnectorNotConnectedError("Bank access token is unavailable")
    return access


def accounts(user_id: str) -> list[BankAccount]:
    access = _access_token(user_id)
    payload = _get_json(f"{_api_base()}/data/v1/accounts", access)
    rows: list[BankAccount] = []
    results = payload.get("results")
    for item in results if isinstance(results, list) else []:
        if not isinstance(item, dict) or not isinstance(item.get("account_id"), str):
            continue
        provider = item.get("provider") if isinstance(item.get("provider"), dict) else {}
        balance: float | None = None
        try:
            balance_payload = _get_json(
                f"{_api_base()}/data/v1/accounts/{item['account_id']}/balance", access
            )
            balance_results = balance_payload.get("results")
            if isinstance(balance_results, list) and balance_results and isinstance(balance_results[0], dict):
                raw_balance = balance_results[0].get("current")
                if isinstance(raw_balance, (int, float)):
                    balance = float(raw_balance)
        except ConnectorUpstreamError:
            logger.warning("truelayer.balance_unavailable account=%s", item["account_id"])
        rows.append(
            BankAccount(
                id=item["account_id"],
                name=str(item.get("display_name", "")),
                type=str(item.get("account_type", "")),
                currency=str(item.get("currency", "")),
                provider=str(provider.get("display_name", "")),
                balance=balance,
            )
        )
    return rows


def transactions(user_id: str, account_id: str, limit: int = 20) -> list[BankTransaction]:
    access = _access_token(user_id)
    query = urlencode({"from": "2026-01-01", "to": _now().date().isoformat()})
    payload = _get_json(
        f"{_api_base()}/data/v1/accounts/{account_id}/transactions?{query}", access
    )
    rows: list[BankTransaction] = []
    results = payload.get("results")
    for item in results if isinstance(results, list) else []:
        if not isinstance(item, dict) or not isinstance(item.get("transaction_id"), str):
            continue
        rows.append(
            BankTransaction(
                id=item["transaction_id"],
                account_id=account_id,
                amount=float(item.get("amount", 0) or 0),
                currency=str(item.get("currency", "")),
                description=str(item.get("description", "")),
                date=str(item.get("timestamp", "")),
                category=item.get("transaction_category") if isinstance(item.get("transaction_category"), str) else None,
            )
        )
        if len(rows) >= min(max(limit, 1), 50):
            break
    return rows


def disconnect(user_id: str) -> None:
    with _lock:
        _tokens().pop(user_id, None)
        _dump()
