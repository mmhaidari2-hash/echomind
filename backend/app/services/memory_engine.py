"""Long-term contextual memory, preferences, and Gemini Flash prompt injection."""

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
_MAX_TURNS = 40

_lock = threading.Lock()
_state: dict[str, object] = {
    "preferences": UserPreferences().model_dump(),
    "facts": [],
    "tags": [],
    "turns": [],
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _clean(value: str, limit: int) -> str:
    text = _CONTROL.sub("", value).strip()
    return text[:limit]


def _safe_key(key: str) -> str:
    cleaned = _clean(key, 80)
    if _SECRET_KEY.search(cleaned):
        raise ValueError("Refusing to store a secret-like memory key")
    return cleaned


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
    _state["preferences"] = {**UserPreferences().model_dump(), **(raw.get("preferences") or {})}
    _state["facts"] = list(raw.get("facts") or [])[-_MAX_FACTS:]
    _state["tags"] = list(raw.get("tags") or [])[:16]
    _state["turns"] = list(raw.get("turns") or [])[-_MAX_TURNS:]


def _dump() -> None:
    _STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "preferences": _state["preferences"],
        "facts": _state["facts"][-_MAX_FACTS:],
        "tags": _state["tags"][:16],
        "turns": _state["turns"][-_MAX_TURNS:],
    }
    tmp = _STORE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, default=str), encoding="utf-8")
    tmp.replace(_STORE_PATH)


_load()


def use_store_path(path: Path) -> None:
    """Point persistence at an isolated file. Used by the production test suite."""
    global _STORE_PATH
    with _lock:
        _STORE_PATH = path
        _state["preferences"] = UserPreferences().model_dump()
        _state["facts"] = []
        _state["tags"] = []
        _state["turns"] = []


def get_preferences() -> UserPreferences:
    with _lock:
        return UserPreferences.model_validate(_state["preferences"])


def update_preferences(payload: UserPreferences) -> UserPreferences:
    cleaned = payload.model_copy()
    if cleaned.display_name:
        cleaned.display_name = _clean(cleaned.display_name, 80) or None
    if cleaned.home_station:
        cleaned.home_station = _clean(cleaned.home_station, 80) or None
    if cleaned.work_station:
        cleaned.work_station = _clean(cleaned.work_station, 80) or None
    if cleaned.preferred_operator:
        cleaned.preferred_operator = _clean(cleaned.preferred_operator, 40) or None
    if cleaned.preferred_retailer:
        cleaned.preferred_retailer = _clean(cleaned.preferred_retailer, 80) or None
    if cleaned.preferred_bank:
        cleaned.preferred_bank = _clean(cleaned.preferred_bank, 80) or None
    with _lock:
        _state["preferences"] = cleaned.model_dump()
        _dump()
    return cleaned


def list_tags() -> list[ContextTag]:
    with _lock:
        return [ContextTag.model_validate(item) for item in _state["tags"]]


def replace_tags(labels: list[tuple[str, bool]]) -> list[ContextTag]:
    tags: list[ContextTag] = []
    seen: set[str] = set()
    for label, active in labels:
        clean = _clean(label, 40).lower()
        if not clean or clean in seen:
            continue
        seen.add(clean)
        tags.append(ContextTag(id=uuid.uuid4().hex[:8], label=clean, active=active))
    with _lock:
        _state["tags"] = [tag.model_dump() for tag in tags[:16]]
        _dump()
    return tags


def add_tag(label: str, active: bool = True) -> ContextTag:
    existing = list_tags()
    clean = _clean(label, 40).lower()
    for tag in existing:
        if tag.label == clean:
            return tag
    tag = ContextTag(id=uuid.uuid4().hex[:8], label=clean, active=active)
    with _lock:
        tags = list(_state["tags"])
        tags.append(tag.model_dump())
        _state["tags"] = tags[:16]
        _dump()
    return tag


def remove_tag(tag_id: str) -> bool:
    with _lock:
        before = list(_state["tags"])
        after = [item for item in before if item.get("id") != tag_id]
        if len(after) == len(before):
            return False
        _state["tags"] = after
        _dump()
        return True


def active_tag_labels() -> list[str]:
    return [tag.label for tag in list_tags() if tag.active]


def locations() -> list[str]:
    prefs = get_preferences()
    found = [item for item in (prefs.home_station, prefs.work_station) if item]
    unique: list[str] = []
    for item in found:
        if item not in unique:
            unique.append(item)
    return unique


def remember(payload: MemoryFactCreate) -> MemoryFact:
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
        facts = list(_state["facts"])
        for existing in facts:
            if existing.get("key") == fact.key and existing.get("value") == fact.value:
                return MemoryFact.model_validate(existing)
        facts.append(fact.model_dump())
        _state["facts"] = facts[-_MAX_FACTS:]
        _dump()
    return fact


def list_facts() -> list[MemoryFact]:
    with _lock:
        rows = [MemoryFact.model_validate(item) for item in _state["facts"]]
    return sorted(rows, key=lambda item: item.created_at, reverse=True)


def recall(query: str, limit: int = 6) -> list[MemoryFact]:
    tokens = {token for token in query.lower().replace("/", " ").split() if len(token) > 2}
    scored: list[tuple[int, MemoryFact]] = []
    for fact in list_facts():
        blob = f"{fact.key} {fact.value}".lower()
        score = sum(1 for token in tokens if token in blob)
        if tokens and score == 0:
            continue
        scored.append((score, fact))
    scored.sort(key=lambda item: (-item[0], item[1].created_at))
    return [fact for _score, fact in scored][:limit]


def hints_for(query: str, limit: int = 6) -> list[str]:
    return [f"{fact.key}: {fact.value}" for fact in recall(query, limit)]


def remember_document(doc: DocumentParseResponse) -> list[MemoryFact]:
    created: list[MemoryFact] = []
    entities = doc.entities
    if entities.operator_name:
        created.append(remember(MemoryFactCreate(key="operator", value=entities.operator_name, source=MemorySource.document)))
    if entities.vendors:
        created.append(remember(MemoryFactCreate(key="vendor", value=entities.vendors[0], source=MemorySource.document)))
    if entities.amounts:
        created.append(remember(MemoryFactCreate(key="amount", value=f"£{entities.amounts[0]}", source=MemorySource.document)))
    if entities.dates:
        created.append(remember(MemoryFactCreate(key="date", value=entities.dates[0], source=MemorySource.document)))
    if doc.summary:
        created.append(remember(MemoryFactCreate(key="document", value=doc.summary[:240], source=MemorySource.document)))
    return created


def remember_watch(watch: WatchCreate) -> MemoryFact:
    value = watch.title
    if watch.anchor_date:
        value = f"{watch.title} ({watch.anchor_date.isoformat()})"
    return remember(MemoryFactCreate(key=watch.kind.value, value=value[:240], source=MemorySource.watch))


def record_turn(conversation_id: str, role: str, text: str, pillar: str | None = None) -> ConversationTurn:
    turn = ConversationTurn(
        conversation_id=conversation_id,
        role=role,
        text=_clean(text, 800),
        pillar=pillar,
        created_at=_now(),
    )
    with _lock:
        turns = list(_state["turns"])
        turns.append(turn.model_dump())
        _state["turns"] = turns[-_MAX_TURNS:]
        _dump()
    return turn


def recent_turns(conversation_id: str | None = None, limit: int = 6) -> list[ConversationTurn]:
    with _lock:
        rows = [ConversationTurn.model_validate(item) for item in _state["turns"]]
    if conversation_id:
        rows = [item for item in rows if item.conversation_id == conversation_id]
    return rows[-limit:]


def last_pillar_for(conversation_id: str | None) -> str | None:
    for turn in reversed(recent_turns(conversation_id, limit=12)):
        if turn.pillar:
            return turn.pillar
    return None


def get_profile() -> MemoryProfile:
    prefs = get_preferences()
    return MemoryProfile(
        preferences=prefs,
        tags=list_tags(),
        locations=locations(),
        facts=list_facts()[:12],
        recent_turns=recent_turns(limit=8),
    )


def build_personalized_prompt(
    message: str,
    locale: str,
    extra_hints: list[str] | None = None,
    conversation_id: str | None = None,
) -> str:
    prefs = get_preferences()
    tags = active_tag_labels()
    recalled = hints_for(message, limit=6)
    extra = [hint.strip() for hint in (extra_hints or []) if hint.strip()]
    hints = list(dict.fromkeys([*recalled, *extra]))[:8]
    turns = recent_turns(conversation_id, limit=4)
    history = "\n".join(f"{turn.role}: {turn.text}" for turn in turns if turn.text)
    locations_line = ", ".join(locations()) or "none"
    name = prefs.display_name or "the user"
    return "\n".join(
        [
            "You are EchoMind, a UK personal assistant for Delay Repay, Consumer Rights Act 2015, and Overdraft Shield.",
            "Use Gemini Flash. Do not invent legal outcomes. Prefer the stored profile when a field is missing.",
            f"Locale: {locale}. Tone: {prefs.tone}. Address: {name}.",
            f"Preferred locations: {locations_line}.",
            f"Preferred operator: {prefs.preferred_operator or 'none'}. Retailer: {prefs.preferred_retailer or 'none'}. Bank: {prefs.preferred_bank or 'none'}.",
            f"Active context tags: {', '.join(tags) or 'none'}.",
            f"Long-term memory: {'; '.join(hints) or 'none'}.",
            f"Recent turns:\n{history or 'none'}",
            f"User: {_clean(message, 800)}",
        ]
    )


def active_context(query: str = "", conversation_id: str | None = None) -> ActiveContext:
    prefs = get_preferences()
    hints = hints_for(query or " ".join(active_tag_labels() + locations()), limit=6)
    prompt = build_personalized_prompt(query or "continue", prefs.locale, hints, conversation_id)
    return ActiveContext(
        preferences=prefs,
        tags=active_tag_labels(),
        locations=locations(),
        hints=hints,
        last_pillar=last_pillar_for(conversation_id),
        prompt_chars=len(prompt),
    )
