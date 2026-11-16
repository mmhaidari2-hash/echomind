"""Owner-scoped long-term contextual memory and conversation persistence."""

from __future__ import annotations

import json
import logging
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.schemas.documents import DocumentParseResponse
from app.schemas.memory import (
    ActiveContext,
    ContextTag,
    ConversationTurn,
    MemoryFact,
    MemoryFactCreate,
    MemoryProfile,
    MemorySource,
    UserPreferences,
)
from app.schemas.notifications import WatchCreate

logger = logging.getLogger(__name__)

_SECRET_KEY = re.compile(r"(api[_-]?key|token|password|secret|authorization)", re.IGNORECASE)
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
_STORE_PATH = Path(__file__).resolve().parents[1] / "data" / "memory_store.json"
_MAX_FACTS = 80
_MAX_TURNS = 80

_lock = threading.Lock()
_state: dict[str, object] = {"users": {}}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _clean(value: str, limit: int) -> str:
    return _CONTROL.sub("", value).strip()[:limit]


def _safe_key(key: str) -> str:
    cleaned = _clean(key, 80)
    if _SECRET_KEY.search(cleaned):
        raise ValueError("Refusing to store a secret-like memory key")
    return cleaned


def _empty_user_state() -> dict[str, object]:
    return {
        "preferences": UserPreferences().model_dump(),
        "facts": [],
        "tags": [],
        "turns": [],
    }


def _normalize_user_id(user_id: str) -> str:
    clean = _clean(user_id, 160)
    if not clean:
        raise ValueError("Missing user identity")
    return clean


def _users() -> dict[str, dict[str, object]]:
    users = _state.setdefault("users", {})
    if not isinstance(users, dict):
        users = {}
        _state["users"] = users
    return users  # type: ignore[return-value]


def _user_state(user_id: str) -> dict[str, object]:
    key = _normalize_user_id(user_id)
    users = _users()
    current = users.get(key)
    if not isinstance(current, dict):
        current = _empty_user_state()
        users[key] = current
    return current


def _load() -> None:
    if not _STORE_PATH.exists():
        return
    try:
        raw = json.loads(_STORE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        logger.warning("memory_engine.store_unreadable")
        return
    if not isinstance(raw, dict):
        return
    users = raw.get("users")
    if isinstance(users, dict):
        _state["users"] = users
        return

    # Older ownerless stores are intentionally not attached to any authenticated user.
    legacy = _STORE_PATH.with_name(f"{_STORE_PATH.stem}.legacy-ownerless.json")
    try:
        if not legacy.exists():
            legacy.write_text(json.dumps(raw, ensure_ascii=False, default=str), encoding="utf-8")
        logger.warning("memory_engine.legacy_ownerless_quarantined")
    except OSError:
        logger.warning("memory_engine.legacy_ownerless_quarantine_failed")


def _dump() -> None:
    _STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {"users": _state.get("users", {})}
    tmp = _STORE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, default=str), encoding="utf-8")
    tmp.replace(_STORE_PATH)


_load()


def use_store_path(path: Path) -> None:
    """Point persistence at an isolated file. Used by tests."""
    global _STORE_PATH
    with _lock:
        _STORE_PATH = path
        _state["users"] = {}


def get_preferences(user_id: str) -> UserPreferences:
    with _lock:
        return UserPreferences.model_validate(_user_state(user_id)["preferences"])


def update_preferences(user_id: str, payload: UserPreferences) -> UserPreferences:
    cleaned = payload.model_copy()
    for field, limit in (
        ("display_name", 80),
        ("home_station", 80),
        ("work_station", 80),
        ("preferred_operator", 40),
        ("preferred_retailer", 80),
        ("preferred_bank", 80),
        ("external_language", 16),
        ("home_market", 8),
        ("jurisdiction", 16),
        ("currency", 3),
        ("travel_destination", 120),
    ):
        value = getattr(cleaned, field)
        if value:
            setattr(cleaned, field, _clean(value, limit) or None)
    with _lock:
        _user_state(user_id)["preferences"] = cleaned.model_dump()
        _dump()
    return cleaned


def list_tags(user_id: str) -> list[ContextTag]:
    with _lock:
        return [ContextTag.model_validate(item) for item in _user_state(user_id)["tags"]]


def replace_tags(user_id: str, labels: list[tuple[str, bool]]) -> list[ContextTag]:
    tags: list[ContextTag] = []
    seen: set[str] = set()
    for label, active in labels:
        clean = _clean(label, 40).lower()
        if not clean or clean in seen:
            continue
        seen.add(clean)
        tags.append(ContextTag(id=uuid.uuid4().hex[:8], label=clean, active=active))
    with _lock:
        _user_state(user_id)["tags"] = [tag.model_dump() for tag in tags[:16]]
        _dump()
    return tags


def add_tag(user_id: str, label: str, active: bool = True) -> ContextTag:
    existing = list_tags(user_id)
    clean = _clean(label, 40).lower()
    for tag in existing:
        if tag.label == clean:
            return tag
    tag = ContextTag(id=uuid.uuid4().hex[:8], label=clean, active=active)
    with _lock:
        state = _user_state(user_id)
        tags = list(state["tags"])
        tags.append(tag.model_dump())
        state["tags"] = tags[:16]
        _dump()
    return tag


def remove_tag(user_id: str, tag_id: str) -> bool:
    with _lock:
        state = _user_state(user_id)
        before = list(state["tags"])
        after = [item for item in before if item.get("id") != tag_id]
        if len(after) == len(before):
            return False
        state["tags"] = after
        _dump()
        return True


def active_tag_labels(user_id: str) -> list[str]:
    return [tag.label for tag in list_tags(user_id) if tag.active]


def locations(user_id: str) -> list[str]:
    prefs = get_preferences(user_id)
    found = [item for item in (prefs.home_station, prefs.work_station) if item]
    return list(dict.fromkeys(found))


def remember(user_id: str, payload: MemoryFactCreate) -> MemoryFact:
    fact = MemoryFact(
        id=uuid.uuid4().hex[:12],
        key=_safe_key(payload.key),
        value=_clean(payload.value, 240),
        source=payload.source,
        created_at=_now(),
    )
    if not fact.value:
        raise ValueError("Memory value is empty")
    with _lock:
        state = _user_state(user_id)
        facts = list(state["facts"])
        for existing in facts:
            if existing.get("key") == fact.key and existing.get("value") == fact.value:
                return MemoryFact.model_validate(existing)
        facts.append(fact.model_dump())
        state["facts"] = facts[-_MAX_FACTS:]
        _dump()
    return fact


def list_facts(user_id: str) -> list[MemoryFact]:
    with _lock:
        rows = [MemoryFact.model_validate(item) for item in _user_state(user_id)["facts"]]
    return sorted(rows, key=lambda item: item.created_at, reverse=True)


def recall(user_id: str, query: str, limit: int = 6) -> list[MemoryFact]:
    tokens = {token for token in query.lower().replace("/", " ").split() if len(token) > 2}
    scored: list[tuple[int, MemoryFact]] = []
    for fact in list_facts(user_id):
        blob = f"{fact.key} {fact.value}".lower()
        score = sum(1 for token in tokens if token in blob)
        if tokens and score == 0:
            continue
        scored.append((score, fact))
    scored.sort(key=lambda item: (-item[0], item[1].created_at))
    return [fact for _score, fact in scored][:limit]


def hints_for(user_id: str, query: str, limit: int = 6) -> list[str]:
    return [f"{fact.key}: {fact.value}" for fact in recall(user_id, query, limit)]


def remember_document(user_id: str, doc: DocumentParseResponse) -> list[MemoryFact]:
    created: list[MemoryFact] = []
    entities = doc.entities
    if entities.operator_name:
        created.append(remember(user_id, MemoryFactCreate(key="operator", value=entities.operator_name, source=MemorySource.document)))
    if entities.vendors:
        created.append(remember(user_id, MemoryFactCreate(key="vendor", value=entities.vendors[0], source=MemorySource.document)))
    if entities.amounts:
        created.append(remember(user_id, MemoryFactCreate(key="amount", value=f"£{entities.amounts[0]}", source=MemorySource.document)))
    if entities.dates:
        created.append(remember(user_id, MemoryFactCreate(key="date", value=entities.dates[0], source=MemorySource.document)))
    if doc.summary:
        created.append(remember(user_id, MemoryFactCreate(key="document", value=doc.summary[:240], source=MemorySource.document)))
    return created


def remember_watch(user_id: str, watch: WatchCreate) -> MemoryFact:
    value = watch.title
    if watch.anchor_date:
        value = f"{watch.title} ({watch.anchor_date.isoformat()})"
    return remember(user_id, MemoryFactCreate(key=watch.kind.value, value=value[:240], source=MemorySource.watch))


def record_turn(
    user_id: str,
    conversation_id: str,
    role: str,
    text: str,
    pillar: str | None = None,
) -> ConversationTurn:
    turn = ConversationTurn(
        conversation_id=conversation_id,
        role=role,
        text=_clean(text, 800),
        pillar=pillar,
        created_at=_now(),
    )
    with _lock:
        state = _user_state(user_id)
        turns = list(state["turns"])
        turns.append(turn.model_dump())
        state["turns"] = turns[-_MAX_TURNS:]
        _dump()
    return turn


def recent_turns(
    user_id: str,
    conversation_id: str | None = None,
    limit: int = 6,
) -> list[ConversationTurn]:
    with _lock:
        rows = [ConversationTurn.model_validate(item) for item in _user_state(user_id)["turns"]]
    if conversation_id:
        rows = [item for item in rows if item.conversation_id == conversation_id]
    return rows[-limit:]


def last_pillar_for(user_id: str, conversation_id: str | None) -> str | None:
    for turn in reversed(recent_turns(user_id, conversation_id, limit=12)):
        if turn.pillar:
            return turn.pillar
    return None


def get_profile(user_id: str) -> MemoryProfile:
    prefs = get_preferences(user_id)
    return MemoryProfile(
        preferences=prefs,
        tags=list_tags(user_id),
        locations=locations(user_id),
        facts=list_facts(user_id)[:12],
        recent_turns=recent_turns(user_id, limit=8),
    )


def build_personalized_prompt(
    user_id: str,
    message: str,
    locale: str,
    extra_hints: list[str] | None = None,
    conversation_id: str | None = None,
) -> str:
    prefs = get_preferences(user_id)
    tags = active_tag_labels(user_id)
    recalled = hints_for(user_id, message, limit=6)
    extra = [hint.strip() for hint in (extra_hints or []) if hint.strip()]
    hints = list(dict.fromkeys([*recalled, *extra]))[:8]
    turns = recent_turns(user_id, conversation_id, limit=4)
    history = "\n".join(f"{turn.role}: {turn.text}" for turn in turns if turn.text)
    locations_line = ", ".join(locations(user_id)) or "none"
    name = prefs.display_name or "the user"
    return "\n".join(
        [
            "You are EchoMind, a UK personal outcome assistant. Use Gemini Flash when generation is enabled.",
            "Do not invent legal or financial outcomes. Prefer verified stored profile fields when a field is missing.",
            f"Input locale: {locale}. UI language: {prefs.ui_language}. Command language: {prefs.command_language}.",
            f"External communication language: {prefs.external_language}. Tone: {prefs.tone}. Address: {name}.",
            f"Home market: {prefs.home_market}. Jurisdiction: {prefs.jurisdiction}. Currency: {prefs.currency}.",
            f"Travel destination: {prefs.travel_destination or 'none'}. Preferred locations: {locations_line}.",
            f"Preferred operator: {prefs.preferred_operator or 'none'}. Retailer: {prefs.preferred_retailer or 'none'}. Bank: {prefs.preferred_bank or 'none'}.",
            f"Active context tags: {', '.join(tags) or 'none'}.",
            f"Long-term memory: {'; '.join(hints) or 'none'}.",
            f"Recent turns:\n{history or 'none'}",
            f"User: {_clean(message, 800)}",
        ]
    )


def active_context(
    user_id: str,
    query: str = "",
    conversation_id: str | None = None,
) -> ActiveContext:
    prefs = get_preferences(user_id)
    query_seed = query or " ".join(active_tag_labels(user_id) + locations(user_id))
    hints = hints_for(user_id, query_seed, limit=6)
    prompt = build_personalized_prompt(user_id, query or "continue", prefs.locale, hints, conversation_id)
    return ActiveContext(
        preferences=prefs,
        tags=active_tag_labels(user_id),
        locations=locations(user_id),
        hints=hints,
        last_pillar=last_pillar_for(user_id, conversation_id),
        prompt_chars=len(prompt),
    )


def delete_conversation(user_id: str, conversation_id: str) -> bool:
    with _lock:
        state = _user_state(user_id)
        before = list(state["turns"])
        after = [item for item in before if item.get("conversation_id") != conversation_id]
        if len(after) == len(before):
            return False
        state["turns"] = after
        _dump()
        return True
