"""Owner-scoped Personal Life Graph, obligations and promises."""

from __future__ import annotations

import json
import threading
import uuid
from datetime import date, datetime, timezone
from pathlib import Path

from app.schemas.life import (
    LifeEdge,
    LifeEdgeCreate,
    LifeNode,
    LifeNodeCreate,
    LifeSnapshot,
    Obligation,
    ObligationCreate,
    ObligationStatus,
    PromiseCreate,
    PromiseRecord,
    PromiseStatus,
)

_STORE_PATH = Path(__file__).resolve().parents[1] / "data" / "life_store.json"
_lock = threading.Lock()
_state: dict[str, dict[str, object]] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _user(user_id: str) -> dict[str, object]:
    return _state.setdefault(
        user_id,
        {
            "nodes": {},
            "edges": {},
            "obligations": {},
            "promises": {},
            "dismissed_detections": [],
            "verifications": {},
        },
    )


def _load() -> None:
    if not _STORE_PATH.exists():
        return
    try:
        raw = json.loads(_STORE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    if isinstance(raw, dict):
        _state.update(raw)


def _dump() -> None:
    _STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = _STORE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(_state, ensure_ascii=False, default=str), encoding="utf-8")
    tmp.replace(_STORE_PATH)


def use_store_path(path: Path) -> None:
    global _STORE_PATH
    with _lock:
        _STORE_PATH = path
        _state.clear()


def _derived_status(item: Obligation, today: date | None = None) -> ObligationStatus:
    if item.status in {ObligationStatus.completed, ObligationStatus.cancelled}:
        return item.status
    if not item.due_date:
        return ObligationStatus.open
    as_of = today or date.today()
    days = (item.due_date - as_of).days
    if days < 0:
        return ObligationStatus.overdue
    if days <= 7:
        return ObligationStatus.due_soon
    return ObligationStatus.open


_load()


def add_node(user_id: str, payload: LifeNodeCreate) -> LifeNode:
    now = _now()
    node = LifeNode(id=uuid.uuid4().hex[:12], created_at=now, updated_at=now, **payload.model_dump())
    with _lock:
        user = _user(user_id)
        rows = dict(user["nodes"])
        rows[node.id] = node.model_dump()
        user["nodes"] = rows
        _dump()
    return node


def list_nodes(user_id: str) -> list[LifeNode]:
    with _lock:
        rows = [LifeNode.model_validate(row) for row in dict(_user(user_id)["nodes"]).values()]
    return sorted(rows, key=lambda item: item.updated_at, reverse=True)


def add_edge(user_id: str, payload: LifeEdgeCreate) -> LifeEdge:
    with _lock:
        user = _user(user_id)
        nodes = dict(user["nodes"])
        if payload.source_id not in nodes or payload.target_id not in nodes:
            raise LookupError("Both relation endpoints must exist")
        for raw in dict(user["edges"]).values():
            existing = LifeEdge.model_validate(raw)
            if (
                existing.source_id == payload.source_id
                and existing.target_id == payload.target_id
                and existing.relation == payload.relation
            ):
                return existing
        edge = LifeEdge(id=uuid.uuid4().hex[:12], created_at=_now(), **payload.model_dump())
        rows = dict(user["edges"])
        rows[edge.id] = edge.model_dump()
        user["edges"] = rows
        _dump()
        return edge


def list_edges(user_id: str) -> list[LifeEdge]:
    with _lock:
        return [LifeEdge.model_validate(row) for row in dict(_user(user_id)["edges"]).values()]


def add_obligation(user_id: str, payload: ObligationCreate) -> Obligation:
    now = _now()
    item = Obligation(
        id=uuid.uuid4().hex[:12],
        status=ObligationStatus.open,
        created_at=now,
        updated_at=now,
        **payload.model_dump(),
    )
    item.status = _derived_status(item)
    with _lock:
        user = _user(user_id)
        rows = dict(user["obligations"])
        rows[item.id] = item.model_dump()
        user["obligations"] = rows
        _dump()
    return item


def list_obligations(user_id: str, *, include_closed: bool = False) -> list[Obligation]:
    with _lock:
        raw_rows = list(dict(_user(user_id)["obligations"]).values())
    rows: list[Obligation] = []
    dirty = False
    for raw in raw_rows:
        item = Obligation.model_validate(raw)
        derived = _derived_status(item)
        if derived != item.status:
            item.status = derived
            item.updated_at = _now()
            dirty = True
        if include_closed or item.status not in {ObligationStatus.completed, ObligationStatus.cancelled}:
            rows.append(item)
    if dirty:
        with _lock:
            user = _user(user_id)
            stored = dict(user["obligations"])
            for item in rows:
                if item.id in stored:
                    stored[item.id] = item.model_dump()
            user["obligations"] = stored
            _dump()
    return sorted(
        rows,
        key=lambda item: (
            item.due_date is None,
            item.due_date or date.max,
            item.created_at,
        ),
    )


def set_obligation_status(user_id: str, obligation_id: str, status: ObligationStatus) -> Obligation:
    with _lock:
        user = _user(user_id)
        rows = dict(user["obligations"])
        raw = rows.get(obligation_id)
        if not isinstance(raw, dict):
            raise LookupError("Obligation not found")
        item = Obligation.model_validate(raw)
        item.status = status
        item.updated_at = _now()
        item.completed_at = _now() if status is ObligationStatus.completed else None
        rows[item.id] = item.model_dump()
        user["obligations"] = rows
        _dump()
        return item


def add_promise(user_id: str, payload: PromiseCreate) -> PromiseRecord:
    now = _now()
    item = PromiseRecord(
        id=uuid.uuid4().hex[:12],
        status=PromiseStatus.open,
        created_at=now,
        updated_at=now,
        **payload.model_dump(),
    )
    with _lock:
        user = _user(user_id)
        rows = dict(user["promises"])
        rows[item.id] = item.model_dump()
        user["promises"] = rows
        _dump()
    return item


def list_promises(user_id: str, *, include_closed: bool = False) -> list[PromiseRecord]:
    with _lock:
        rows = [PromiseRecord.model_validate(row) for row in dict(_user(user_id)["promises"]).values()]
    if not include_closed:
        rows = [item for item in rows if item.status is PromiseStatus.open]
    return sorted(
        rows,
        key=lambda item: (
            item.due_date is None,
            item.due_date or date.max,
            item.created_at,
        ),
    )


def set_promise_status(user_id: str, promise_id: str, status: PromiseStatus) -> PromiseRecord:
    with _lock:
        user = _user(user_id)
        rows = dict(user["promises"])
        raw = rows.get(promise_id)
        if not isinstance(raw, dict):
            raise LookupError("Promise not found")
        item = PromiseRecord.model_validate(raw)
        item.status = status
        item.updated_at = _now()
        item.resolved_at = _now() if status is not PromiseStatus.open else None
        rows[item.id] = item.model_dump()
        user["promises"] = rows
        _dump()
        return item


def snapshot(user_id: str) -> LifeSnapshot:
    return LifeSnapshot(
        nodes=list_nodes(user_id),
        edges=list_edges(user_id),
        obligations=list_obligations(user_id),
        promises=list_promises(user_id),
    )


def recorded_evidence_ids(user_id: str) -> set[str]:
    """Gmail message ids already attached to an obligation or promise."""
    with _lock:
        user = _user(user_id)
        ids: set[str] = set()
        for key in ("obligations", "promises"):
            rows = user.get(key)
            if not isinstance(rows, dict):
                continue
            for raw in dict(rows).values():
                if not isinstance(raw, dict):
                    continue
                for value in raw.get("evidence_ids", []) or []:
                    if isinstance(value, str) and value:
                        ids.add(value)
        return ids


def dismissed_detection_ids(user_id: str) -> set[str]:
    with _lock:
        rows = _user(user_id).get("dismissed_detections", [])
        return set(value for value in (rows or []) if isinstance(value, str))


def dismiss_detection(user_id: str, proposal_id: str) -> None:
    with _lock:
        user = _user(user_id)
        rows = [value for value in (user.get("dismissed_detections", []) or []) if isinstance(value, str)]
        if proposal_id not in rows:
            rows.append(proposal_id)
        user["dismissed_detections"] = rows[-500:]
        _dump()


def record_verification(user_id: str, source_id: str, result: dict[str, object]) -> None:
    """Persist an outcome verification so it survives restart (additive)."""
    with _lock:
        user = _user(user_id)
        rows = user.get("verifications")
        if not isinstance(rows, dict):
            rows = {}
        rows[source_id] = result
        user["verifications"] = rows
        _dump()


def get_verification(user_id: str, source_id: str) -> dict[str, object] | None:
    with _lock:
        rows = _user(user_id).get("verifications")
        if not isinstance(rows, dict):
            return None
        raw = rows.get(source_id)
        return dict(raw) if isinstance(raw, dict) else None
