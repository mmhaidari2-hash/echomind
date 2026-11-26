"""Provider registry: model-provider slots for EchoMind's answers.

Mahdi wants EchoMind to have slots for GPT (ChatGPT), Claude and
Cursor, plus empty slots he can fill later himself. The registry is
one owner-scoped JSON store (same pattern as the Life Graph store):
three built-in slots, plus custom slots the owner adds. Three empty
custom slots are seeded for every user, so there is always room to
add a provider without a "create" step first.

Keys are Fernet-encrypted with the same CONNECTOR_TOKEN_KEY as the
other connectors, stored server-side only, and NEVER returned to the
client — a slot only reports `has_key`. A slot with no key (or no
endpoint) says "needs key" / "needs endpoint" and fails closed:
activating it is refused (409), and testing it is refused (409).
Nothing pretends a keyless provider works.

`test_provider` makes one real, cheap call — GET {endpoint}/models —
with the provider's own auth header (Bearer for OpenAI-compatible
APIs, x-api-key for Anthropic). A 200 means the key and endpoint
work; anything else is reported with its status, never as a pass.
No chat completion is sent, so the test costs nothing.
"""

from __future__ import annotations

import json
import logging
import threading
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings
from app.schemas.providers import ProviderCreate, ProviderSlot, ProviderTestResult, ProviderUpdate

logger = logging.getLogger(__name__)

_STORE = Path(__file__).resolve().parent.parent / "data" / "providers.json"
_lock = threading.Lock()
_state: dict[str, dict[str, object]] = {}
_path = _STORE

_EMPTY_SLOTS = 3
_HTTP_TIMEOUT = 15

BUILTINS: list[dict[str, str]] = [
    {
        "id": "gpt",
        "name": "GPT (ChatGPT)",
        "provider": "gpt",
        "model": "gpt-4o",
        "endpoint": "https://api.openai.com/v1",
    },
    {
        "id": "claude",
        "name": "Claude",
        "provider": "claude",
        "model": "claude-sonnet-4-5-20250929",
        "endpoint": "https://api.anthropic.com/v1",
    },
    {
        "id": "cursor",
        "name": "Cursor",
        "provider": "cursor",
        "model": "",
        "endpoint": "",
    },
]


class ProviderNotConfiguredError(Exception):
    """The server has no encryption key for provider secrets."""


class ProviderNotReadyError(Exception):
    """The slot cannot run yet — it needs a key, an endpoint, or both."""


class ProviderUpstreamError(Exception):
    """The provider could not be reached at all."""


def use_store_path(path: Path) -> None:
    global _path
    _path = path
    _load()


def _load() -> None:
    global _state
    try:
        raw = _path.read_text(encoding="utf-8") if _path.exists() else "{}"
        parsed = json.loads(raw) if raw.strip() else {}
        _state = parsed if isinstance(parsed, dict) else {}
    except (OSError, ValueError):
        _state = {}


def _dump() -> None:
    _path.parent.mkdir(parents=True, exist_ok=True)
    tmp = _path.with_suffix(".tmp")
    tmp.write_text(json.dumps(_state, ensure_ascii=False, default=str), encoding="utf-8")
    tmp.replace(_path)


def reset_store() -> None:
    global _state
    _state = {}


def _fernet() -> Fernet:
    key = settings.CONNECTOR_TOKEN_KEY.strip().encode("ascii", errors="strict")
    if not key:
        raise ProviderNotConfiguredError("Provider key storage is not configured")
    try:
        return Fernet(key)
    except (ValueError, TypeError) as exc:
        raise ProviderNotConfiguredError("Provider encryption key is invalid") from exc


def _encrypt_key(api_key: str) -> str:
    return _fernet().encrypt(api_key.encode("utf-8")).decode("ascii")


def _decrypt_key(blob: str) -> str:
    try:
        return _fernet().decrypt(blob.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, UnicodeDecodeError) as exc:
        raise ProviderNotReadyError("The stored key cannot be read") from exc


def _user_record(user_id: str) -> dict[str, object]:
    record = _state.setdefault(user_id, {"active_id": None, "slots": {}})
    if not isinstance(record, dict):
        record = {"active_id": None, "slots": {}}
        _state[user_id] = record
    slots = record.setdefault("slots", {})
    if not isinstance(slots, dict):
        slots = {}
        record["slots"] = slots
    if "active_id" not in record:
        record["active_id"] = None
    # Seed the empty slots every user starts with, and keep at least
    # three empty ones around, so there is always room to add a
    # provider without a "create" step first.
    empties = [
        row
        for row in slots.values()
        if isinstance(row, dict) and not row.get("builtin") and not str(row.get("name", "")).strip()
    ]
    if len(empties) < _EMPTY_SLOTS:
        for _ in range(_EMPTY_SLOTS - len(empties)):
            slot_id = uuid.uuid4().hex[:12]
            slots[slot_id] = {
                "name": "",
                "provider": "custom",
                "model": "",
                "endpoint": "",
                "key": None,
                "builtin": False,
            }
        _dump()
    return record


def _stored_slot(record: dict[str, object], slot_id: str) -> dict[str, object] | None:
    slots = record.get("slots")
    if not isinstance(slots, dict):
        return None
    row = slots.get(slot_id)
    return dict(row) if isinstance(row, dict) else None


def _builtin(slot_id: str) -> dict[str, str] | None:
    for item in BUILTINS:
        if item["id"] == slot_id:
            return item
    return None


def _to_slot(user_id: str, slot_id: str, record: dict[str, object]) -> ProviderSlot | None:
    builtin = _builtin(slot_id)
    stored = _stored_slot(record, slot_id)
    if builtin is None and stored is None:
        return None
    name = str(stored.get("name", "")) if stored else builtin["name"]
    provider = str(stored.get("provider", "")) if stored else builtin["provider"]
    model = str(stored.get("model", "")) if stored else builtin["model"]
    endpoint = str(stored.get("endpoint", "")) if stored else builtin["endpoint"]
    key = stored.get("key") if stored else None
    return ProviderSlot(
        id=slot_id,
        name=name,
        provider=provider,
        model=model,
        endpoint=endpoint,
        has_key=isinstance(key, str) and bool(key),
        has_endpoint=bool(endpoint.strip()),
        is_active=record.get("active_id") == slot_id,
        builtin=builtin is not None,
    )


def list_providers(user_id: str) -> list[ProviderSlot]:
    with _lock:
        record = _user_record(user_id)
        slots = record.get("slots")
        ordered: list[str] = [item["id"] for item in BUILTINS]
        if isinstance(slots, dict):
            ordered.extend(
                slot_id
                for slot_id in slots
                if slot_id not in ordered and isinstance(slots[slot_id], dict)
            )
        return [slot for slot_id in ordered if (slot := _to_slot(user_id, slot_id, record)) is not None]


def get_provider(user_id: str, slot_id: str) -> ProviderSlot | None:
    with _lock:
        record = _user_record(user_id)
        return _to_slot(user_id, slot_id, record)


def create_provider(user_id: str, payload: ProviderCreate) -> ProviderSlot:
    with _lock:
        record = _user_record(user_id)
        slot_id = uuid.uuid4().hex[:12]
        key = _encrypt_key(payload.api_key) if payload.api_key else None
        slots = record["slots"]
        assert isinstance(slots, dict)
        slots[slot_id] = {
            "name": payload.name,
            "provider": payload.provider or "custom",
            "model": payload.model,
            "endpoint": payload.endpoint,
            "key": key,
            "builtin": False,
        }
        _dump()
        slot = _to_slot(user_id, slot_id, record)
        assert slot is not None
        return slot


def update_provider(user_id: str, slot_id: str, payload: ProviderUpdate) -> ProviderSlot:
    with _lock:
        record = _user_record(user_id)
        builtin = _builtin(slot_id)
        stored = _stored_slot(record, slot_id)
        if builtin is None and stored is None:
            raise LookupError(f"No provider slot with id {slot_id}")
        slots = record["slots"]
        assert isinstance(slots, dict)
        row = stored if stored is not None else {
            "name": builtin["name"],
            "provider": builtin["provider"],
            "model": builtin["model"],
            "endpoint": builtin["endpoint"],
            "key": None,
            "builtin": True,
        }
        if builtin is not None and payload.name is not None and payload.name != builtin["name"]:
            raise ValueError("A built-in slot's name cannot be changed")
        if payload.name is not None:
            row["name"] = payload.name
        if payload.model is not None:
            row["model"] = payload.model
        if payload.endpoint is not None:
            row["endpoint"] = payload.endpoint
        if payload.clear_key:
            row["key"] = None
        elif payload.api_key:
            row["key"] = _encrypt_key(payload.api_key)
        slots[slot_id] = row
        # A slot that loses its key or endpoint cannot stay active:
        # it would claim to answer with a provider that cannot run.
        if record.get("active_id") == slot_id:
            has_key = isinstance(row.get("key"), str) and bool(row["key"])
            has_endpoint = bool(str(row.get("endpoint", "")).strip())
            if not has_key or not has_endpoint:
                record["active_id"] = None
        _dump()
        slot = _to_slot(user_id, slot_id, record)
        assert slot is not None
        return slot


def delete_provider(user_id: str, slot_id: str) -> None:
    with _lock:
        record = _user_record(user_id)
        if _builtin(slot_id) is not None:
            raise ValueError("A built-in slot cannot be deleted")
        slots = record["slots"]
        assert isinstance(slots, dict)
        if slot_id not in slots:
            raise LookupError(f"No provider slot with id {slot_id}")
        del slots[slot_id]
        if record.get("active_id") == slot_id:
            record["active_id"] = None
        _dump()


def set_active(user_id: str, slot_id: str) -> ProviderSlot:
    with _lock:
        record = _user_record(user_id)
        slot = _to_slot(user_id, slot_id, record)
        if slot is None:
            raise LookupError(f"No provider slot with id {slot_id}")
        if not slot.has_key:
            raise ProviderNotReadyError(f"Slot {slot.name or slot_id} needs an API key first")
        if not slot.has_endpoint:
            raise ProviderNotReadyError(f"Slot {slot.name or slot_id} needs an endpoint first")
        record["active_id"] = slot_id
        _dump()
        slot.is_active = True
        return slot


def get_active(user_id: str) -> ProviderSlot | None:
    with _lock:
        record = _user_record(user_id)
        active_id = record.get("active_id")
        if not isinstance(active_id, str):
            return None
        return _to_slot(user_id, active_id, record)


def _stored_key(user_id: str, slot_id: str) -> str:
    with _lock:
        record = _user_record(user_id)
        stored = _stored_slot(record, slot_id)
    if stored is None and _builtin(slot_id) is None:
        raise LookupError(f"No provider slot with id {slot_id}")
    blob = stored.get("key") if stored else None
    if not isinstance(blob, str) or not blob:
        raise ProviderNotReadyError("This slot needs an API key first")
    return _decrypt_key(blob)


def _test_headers(slot: ProviderSlot, api_key: str) -> dict[str, str]:
    if slot.provider == "claude":
        return {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Accept": "application/json",
        }
    return {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}


def test_provider(user_id: str, slot_id: str, *, _urlopen=None) -> ProviderTestResult:
    """One cheap live call — GET {endpoint}/models. A 200 means the
    key and endpoint work; anything else is reported with its status,
    never as a pass. No completion is sent, so the test costs nothing."""
    opener = _urlopen or urlopen
    with _lock:
        record = _user_record(user_id)
        slot = _to_slot(user_id, slot_id, record)
    if slot is None:
        raise LookupError(f"No provider slot with id {slot_id}")
    if not slot.has_endpoint:
        raise ProviderNotReadyError(f"Slot {slot.name or slot_id} needs an endpoint first")
    api_key = _stored_key(user_id, slot_id)
    url = slot.endpoint.rstrip("/") + "/models"
    request = Request(url, method="GET", headers=_test_headers(slot, api_key))
    try:
        with opener(request, timeout=_HTTP_TIMEOUT) as response:
            response.read()
        return ProviderTestResult(ok=True, status=200, detail="The key and endpoint work.")
    except HTTPError as exc:
        logger.warning("providers.test_http_error slot=%s status=%s", slot_id, exc.code)
        return ProviderTestResult(
            ok=False,
            status=exc.code,
            detail=f"The provider answered HTTP {exc.code} — check the key and endpoint.",
        )
    except (URLError, TimeoutError, OSError) as exc:
        logger.warning("providers.test_transport_error slot=%s type=%s", slot_id, type(exc).__name__)
        raise ProviderUpstreamError("The provider could not be reached") from exc


_load()
