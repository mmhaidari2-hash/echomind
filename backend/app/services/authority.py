"""Bounded authority proposals, explicit confirmation, idempotency and audit."""

from __future__ import annotations

import hashlib
import json
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.schemas.authority import ActionProposal, ActionProposalCreate, ActionStatus, AuditEvent
from app.services.tool_registry import ALLOWED_TOOLS, execute_tool

_STORE_PATH = Path(__file__).resolve().parents[1] / "data" / "authority_store.json"
_lock = threading.Lock()
_state: dict[str, dict[str, object]] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _user(user_id: str) -> dict[str, object]:
    return _state.setdefault(user_id, {"actions": {}, "audit": []})


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


def _audit(user_id: str, action_id: str, event: str, detail: str | None = None) -> None:
    row = AuditEvent(
        id=uuid.uuid4().hex[:12],
        action_id=action_id,
        event=event,
        created_at=_now(),
        detail=detail,
    )
    user = _user(user_id)
    rows = list(user.get("audit", []))
    rows.append(row.model_dump())
    user["audit"] = rows[-500:]


def _key(payload: ActionProposalCreate) -> str:
    if payload.idempotency_key:
        return payload.idempotency_key
    raw = json.dumps(
        {"tool": payload.tool, "parameters": payload.parameters, "evidence_ids": payload.evidence_ids},
        sort_keys=True,
        default=str,
    ).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:32]


_load()


def propose(user_id: str, payload: ActionProposalCreate) -> ActionProposal:
    if payload.tool not in ALLOWED_TOOLS:
        raise ValueError("Tool is not allowlisted")
    key = _key(payload)
    with _lock:
        user = _user(user_id)
        actions = dict(user.get("actions", {}))
        for row in actions.values():
            if isinstance(row, dict) and row.get("idempotency_key") == key:
                return ActionProposal.model_validate(row)
        now = _now()
        action = ActionProposal(
            id=uuid.uuid4().hex[:12],
            tool=payload.tool,
            summary=payload.summary.strip(),
            parameters=payload.parameters,
            evidence_ids=payload.evidence_ids,
            idempotency_key=key,
            status=ActionStatus.proposed,
            created_at=now,
            expires_at=now + timedelta(minutes=10),
        )
        actions[action.id] = action.model_dump()
        user["actions"] = actions
        _audit(user_id, action.id, "proposed")
        _dump()
        return action


def list_actions(user_id: str) -> list[ActionProposal]:
    with _lock:
        rows = [ActionProposal.model_validate(row) for row in dict(_user(user_id).get("actions", {})).values()]
    return sorted(rows, key=lambda item: item.created_at, reverse=True)


def confirm_and_execute(user_id: str, action_id: str) -> ActionProposal:
    with _lock:
        user = _user(user_id)
        actions = dict(user.get("actions", {}))
        raw = actions.get(action_id)
        if not isinstance(raw, dict):
            raise LookupError("Action not found")
        action = ActionProposal.model_validate(raw)
        if action.status is not ActionStatus.proposed:
            return action
        if action.expires_at < _now():
            action.status = ActionStatus.cancelled
            actions[action.id] = action.model_dump()
            user["actions"] = actions
            _audit(user_id, action.id, "expired")
            _dump()
            raise ValueError("Action proposal expired")
        action.confirmed_at = _now()
        _audit(user_id, action.id, "confirmed")
        _dump()

    try:
        result = execute_tool(user_id, action.tool, action.parameters)
    except Exception as exc:
        with _lock:
            action.status = ActionStatus.failed
            action.executed_at = _now()
            action.result = {"error": type(exc).__name__}
            actions = dict(_user(user_id).get("actions", {}))
            actions[action.id] = action.model_dump()
            _user(user_id)["actions"] = actions
            _audit(user_id, action.id, "failed", type(exc).__name__)
            _dump()
        raise ValueError("Action execution failed") from exc

    with _lock:
        action.status = ActionStatus.executed
        action.executed_at = _now()
        action.result = result
        actions = dict(_user(user_id).get("actions", {}))
        actions[action.id] = action.model_dump()
        _user(user_id)["actions"] = actions
        _audit(user_id, action.id, "executed")
        _dump()
    return action


def cancel(user_id: str, action_id: str) -> ActionProposal:
    with _lock:
        user = _user(user_id)
        actions = dict(user.get("actions", {}))
        raw = actions.get(action_id)
        if not isinstance(raw, dict):
            raise LookupError("Action not found")
        action = ActionProposal.model_validate(raw)
        if action.status is ActionStatus.proposed:
            action.status = ActionStatus.cancelled
            actions[action.id] = action.model_dump()
            user["actions"] = actions
            _audit(user_id, action.id, "cancelled")
            _dump()
        return action


def audit_events(user_id: str) -> list[AuditEvent]:
    with _lock:
        rows = [AuditEvent.model_validate(row) for row in list(_user(user_id).get("audit", []))]
    return list(reversed(rows))
