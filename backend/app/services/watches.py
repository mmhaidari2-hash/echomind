"""Scheduled watches: "when X happens, propose Y" — the Lindy gap.

Lindy runs triggers around the clock; EchoMind's detectors only ran
when the owner tapped "Check inbox". A watch closes that gap in the
safe half: the watch definition (trigger + condition + action) is
stored, and evaluation produces *proposals* with evidence. Nothing is
sent, created or changed by evaluation itself — the owner accepts each
proposal, and accepting creates an obligation (with the follow-up draft
in its notes) through the normal Bounded Authority path.

Triggers (deterministic, no LLM):
- ``gmail_query`` — new Gmail matching a query (and optional
  sender/subject contains), checked against the last 7 days.
- ``promise_overdue`` — open promises past their due date.
- ``unanswered_mail`` — sent emails with no reply for N days.

The production runner is NOT in this module: something has to call
``evaluate_all`` on a schedule (a Railway cron or a GitHub Actions
schedule hitting POST /watches/evaluate-all). Until that is deployed,
evaluation runs on demand from the app. See
docs/lindy-shortwave-claude-gaps.md — this is stated there, not hidden.
"""

from __future__ import annotations

import hashlib
import json
import threading
import uuid
from datetime import date, datetime, timezone
from pathlib import Path

from app.schemas.followup import FollowupStepKind
from app.schemas.life import ObligationCreate
from app.schemas.watches import WatchCreate, WatchEvaluateResult, WatchProposal, WatchRecord
from app.services import google_connector
from app.services.followup import draft_followup, followup_steps
from app.services.life import add_obligation, list_promises
from app.services.mail import find_unanswered

_STORE = Path(__file__).resolve().parent.parent / "data" / "watches.json"
_lock = threading.Lock()
_state: dict[str, dict[str, dict[str, object]]] = {}
_path = _STORE

_TRIGGERS = ("gmail_query", "promise_overdue", "unanswered_mail")
_ACTIONS = ("create_obligation", "draft_followup")


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


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _user(user_id: str) -> dict[str, dict[str, object]]:
    return _state.setdefault(user_id, {"watches": {}, "proposals": {}})


def _watches(user_id: str) -> dict[str, dict[str, object]]:
    rows = _user(user_id).get("watches")
    if not isinstance(rows, dict):
        rows = {}
        _user(user_id)["watches"] = rows
    return rows


def _proposals(user_id: str) -> dict[str, dict[str, object]]:
    rows = _user(user_id).get("proposals")
    if not isinstance(rows, dict):
        rows = {}
        _user(user_id)["proposals"] = rows
    return rows


def _validate(payload: WatchCreate) -> None:
    if payload.trigger not in _TRIGGERS:
        raise ValueError(f"Unknown trigger {payload.trigger}")
    if payload.action not in _ACTIONS:
        raise ValueError(f"Unknown action {payload.action}")
    if payload.trigger == "gmail_query":
        query = payload.condition.get("query")
        if not isinstance(query, str) or not query.strip():
            raise ValueError("A gmail_query watch needs condition.query (a Gmail search)")
    if payload.trigger == "unanswered_mail":
        days = payload.condition.get("days", 3)
        if not isinstance(days, int) or not 1 <= days <= 90:
            raise ValueError("An unanswered_mail watch needs condition.days between 1 and 90")


def create_watch(user_id: str, payload: WatchCreate) -> WatchRecord:
    _validate(payload)
    now = _now()
    record = WatchRecord(
        id=uuid.uuid4().hex[:12],
        created_at=now,
        updated_at=now,
        **payload.model_dump(),
    )
    with _lock:
        _watches(user_id)[record.id] = record.model_dump(mode="json")
        _dump()
    return record


def list_watches(user_id: str) -> list[WatchRecord]:
    with _lock:
        rows = [WatchRecord.model_validate(dict(row)) for row in _watches(user_id).values()]
    return sorted(rows, key=lambda item: item.created_at, reverse=True)


def get_watch(user_id: str, watch_id: str) -> WatchRecord | None:
    with _lock:
        raw = _watches(user_id).get(watch_id)
    return WatchRecord.model_validate(dict(raw)) if isinstance(raw, dict) else None


def delete_watch(user_id: str, watch_id: str) -> bool:
    with _lock:
        gone = _watches(user_id).pop(watch_id, None) is not None
        _dump()
    return gone


def set_watch_enabled(user_id: str, watch_id: str, enabled: bool) -> WatchRecord:
    with _lock:
        raw = _watches(user_id).get(watch_id)
        if not isinstance(raw, dict):
            raise LookupError(f"No watch with id {watch_id}")
        record = WatchRecord.model_validate(dict(raw))
        record.enabled = enabled
        record.updated_at = _now()
        _watches(user_id)[watch_id] = record.model_dump(mode="json")
        _dump()
    return record


def _proposal_id(watch_id: str, action: str, evidence: str) -> str:
    raw = f"{watch_id}|{action}|{evidence}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:16]


def _store_proposal(user_id: str, proposal: WatchProposal) -> WatchProposal | None:
    """Store unless an identical proposal already exists (dedupe)."""
    with _lock:
        rows = _proposals(user_id)
        if proposal.id in rows:
            return None
        rows[proposal.id] = proposal.model_dump(mode="json")
        _dump()
    return proposal


def list_proposals(user_id: str, watch_id: str | None = None) -> list[WatchProposal]:
    with _lock:
        rows = [WatchProposal.model_validate(dict(row)) for row in _proposals(user_id).values()]
    if watch_id is not None:
        rows = [row for row in rows if row.watch_id == watch_id]
    return sorted(rows, key=lambda item: item.created_at, reverse=True)


def _evaluate_gmail_query(user_id: str, watch: WatchRecord) -> list[WatchProposal]:
    condition = watch.condition
    query = str(condition.get("query", "")).strip()
    sender_contains = str(condition.get("sender_contains", "") or "").lower()
    subject_contains = str(condition.get("subject_contains", "") or "").lower()
    messages = google_connector.search_gmail(user_id, query, 20)
    proposals: list[WatchProposal] = []
    for message in messages:
        if sender_contains and sender_contains not in message.sender.lower():
            continue
        if subject_contains and subject_contains not in message.subject.lower():
            continue
        subject = message.subject or "(no subject)"
        if watch.action == "draft_followup":
            draft_subject = f"Follow-up — {subject}"
            draft_body = (
                f"Hello,\n\nI am following up on your email \"{subject}\" "
                f"from {message.sender}.\n\nThank you."
            )
            obligation_title = f"Follow up: {subject}"
            obligation_notes = f"Watch '{watch.name}' matched Gmail message {message.id}."
        else:
            draft_subject = ""
            draft_body = ""
            obligation_title = f"Check: {subject}"
            obligation_notes = (
                f"Watch '{watch.name}' matched Gmail message {message.id} "
                f"({message.sender})."
            )
        proposals.append(
            WatchProposal(
                id=_proposal_id(watch.id, watch.action, message.id),
                watch_id=watch.id,
                action=watch.action,
                title=obligation_title,
                detail=f"Matched Gmail: {subject} — {message.sender}",
                evidence_message_id=message.id,
                evidence_subject=subject,
                evidence_sender=message.sender,
                draft_subject=draft_subject,
                draft_body=draft_body,
                obligation_title=obligation_title,
                obligation_notes=obligation_notes,
                created_at=_now(),
            )
        )
    return proposals


def _evaluate_promise_overdue(user_id: str, watch: WatchRecord, today: date) -> list[WatchProposal]:
    proposals: list[WatchProposal] = []
    for promise in list_promises(user_id):
        if promise.due_date is None or promise.due_date >= today:
            continue
        steps = followup_steps(promise, today)
        step = next((item for item in steps if item.step is FollowupStepKind.chase), steps[-1] if steps else None)
        if step is None:
            continue
        draft = draft_followup(promise, step.step, evidence_sender=None)
        obligation_title = f"Chase {promise.counterparty} — {promise.promise[:80]}"
        proposals.append(
            WatchProposal(
                id=_proposal_id(watch.id, watch.action, promise.id),
                watch_id=watch.id,
                action=watch.action,
                title=obligation_title,
                detail=f"Promise overdue since {promise.due_date.isoformat()}: {promise.promise[:120]}",
                draft_to=draft.to,
                draft_subject=draft.subject,
                draft_body=draft.body,
                obligation_title=obligation_title,
                obligation_notes=(
                    f"Watch '{watch.name}': {promise.counterparty} promised "
                    f"\"{promise.promise}\" by {promise.due_date.isoformat()} and it is overdue."
                ),
                created_at=_now(),
            )
        )
    return proposals


def _evaluate_unanswered(user_id: str, watch: WatchRecord, today: date) -> list[WatchProposal]:
    days = watch.condition.get("days", 3)
    days = days if isinstance(days, int) else 3
    threads = find_unanswered(user_id, days=days, limit=20, today=today)
    proposals: list[WatchProposal] = []
    for thread in threads:
        obligation_title = f"Chase {thread.recipient} — no reply to \"{thread.subject[:80]}\""
        proposals.append(
            WatchProposal(
                id=_proposal_id(watch.id, watch.action, thread.thread_id),
                watch_id=watch.id,
                action=watch.action,
                title=obligation_title,
                detail=f"No reply for {thread.days_waiting} day(s) to: {thread.subject}",
                evidence_message_id=thread.message_id,
                evidence_subject=thread.subject,
                evidence_sender=thread.recipient,
                draft_to=thread.recipient,
                draft_subject=thread.draft_subject,
                draft_body=thread.draft_body,
                obligation_title=obligation_title,
                obligation_notes=(
                    f"Watch '{watch.name}': sent {thread.sent_date}, "
                    f"no reply for {thread.days_waiting} day(s)."
                ),
                created_at=_now(),
            )
        )
    return proposals


def evaluate_watch(user_id: str, watch_id: str, *, today: date | None = None) -> WatchEvaluateResult:
    watch = get_watch(user_id, watch_id)
    if watch is None:
        raise LookupError(f"No watch with id {watch_id}")
    as_of = today or date.today()
    if watch.trigger == "gmail_query":
        found = _evaluate_gmail_query(user_id, watch)
    elif watch.trigger == "promise_overdue":
        found = _evaluate_promise_overdue(user_id, watch, as_of)
    else:
        found = _evaluate_unanswered(user_id, watch, as_of)
    fresh: list[WatchProposal] = []
    for proposal in found:
        stored = _store_proposal(user_id, proposal)
        if stored is not None:
            fresh.append(stored)
    with _lock:
        raw = _watches(user_id).get(watch_id)
        if isinstance(raw, dict):
            record = WatchRecord.model_validate(dict(raw))
            record.last_evaluated_at = _now()
            record.last_result_count = len(found)
            record.updated_at = _now()
            _watches(user_id)[watch_id] = record.model_dump(mode="json")
            _dump()
    return WatchEvaluateResult(
        watch_id=watch_id, evaluated_at=_now(), new_proposals=len(fresh), proposals=fresh
    )


def evaluate_all(user_id: str, *, today: date | None = None) -> list[WatchEvaluateResult]:
    """Evaluate every enabled watch. This is the entry point a
    scheduled runner calls (Railway cron / GitHub Actions schedule)."""
    results: list[WatchEvaluateResult] = []
    for watch in list_watches(user_id):
        if not watch.enabled:
            continue
        results.append(evaluate_watch(user_id, watch.id, today=today))
    return results


def accept_proposal(user_id: str, proposal_id: str):
    """Accept a proposal: create the obligation it proposes, through
    the normal Life Graph path. The follow-up draft (if any) travels
    in the obligation's notes — sending it still needs the owner's
    confirmation through the gmail.send flow."""
    with _lock:
        raw = _proposals(user_id).get(proposal_id)
        if not isinstance(raw, dict):
            raise LookupError(f"No proposal with id {proposal_id}")
        proposal = WatchProposal.model_validate(dict(raw))
        if proposal.status != "proposed":
            raise ValueError(f"Proposal is {proposal.status} and cannot be accepted")
    notes = proposal.obligation_notes or proposal.detail
    if proposal.draft_body:
        notes += (
            f"\n\nDraft follow-up:\nTo: {proposal.draft_to or '(unknown)'}\n"
            f"Subject: {proposal.draft_subject}\n\n{proposal.draft_body}"
        )
    item = add_obligation(
        user_id,
        ObligationCreate(
            title=(proposal.obligation_title or proposal.title)[:200],
            source="watch",
            evidence_ids=[proposal.evidence_message_id] if proposal.evidence_message_id else [],
            notes=notes,
        ),
    )
    with _lock:
        proposal.status = "accepted"
        proposal.obligation_id = item.id
        _proposals(user_id)[proposal_id] = proposal.model_dump(mode="json")
        _dump()
    return proposal, item


def dismiss_proposal(user_id: str, proposal_id: str) -> WatchProposal:
    with _lock:
        raw = _proposals(user_id).get(proposal_id)
        if not isinstance(raw, dict):
            raise LookupError(f"No proposal with id {proposal_id}")
        proposal = WatchProposal.model_validate(dict(raw))
        proposal.status = "dismissed"
        _proposals(user_id)[proposal_id] = proposal.model_dump(mode="json")
        _dump()
    return proposal


_load()
