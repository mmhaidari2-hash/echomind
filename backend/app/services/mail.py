"""Mail actions Shortwave has and EchoMind did not: snooze and the
unanswered-mail chase.

- Snooze: park an email; it resurfaces as an obligation on the date
  the owner chose (the Morning Brief and the obligations list surface
  it then). Cancelling the snooze cancels that obligation too.
- Unanswered: find sent emails nobody replied to within N days and
  propose a follow-up draft for each. Nothing is sent here — the draft
  is a proposal the owner sends through the Bounded Authority flow.

Both are deterministic and owner-scoped. Both fail closed when Google
is not connected (the connector raises, the endpoint maps it to 409).
"""

from __future__ import annotations

import json
import re
import threading
import uuid
from datetime import date, datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

from app.schemas.life import ObligationCreate, ObligationStatus
from app.schemas.mail import SnoozeCreate, SnoozeRecord, UnansweredThread
from app.services import google_connector
from app.services.life import add_obligation, set_obligation_status

_STORE = Path(__file__).resolve().parent.parent / "data" / "snoozes.json"
_lock = threading.Lock()
_state: dict[str, dict[str, dict[str, object]]] = {}
_path = _STORE


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
    return _state.setdefault(user_id, {})


def _derived_status(raw: dict[str, object], today: date | None = None) -> str:
    stored = str(raw.get("status", "active"))
    if stored in {"cancelled"}:
        return stored
    try:
        until = date.fromisoformat(str(raw.get("snooze_until", "")))
    except ValueError:
        return stored
    as_of = today or date.today()
    return "due" if until <= as_of else "active"


def snooze_email(user_id: str, payload: SnoozeCreate) -> SnoozeRecord:
    """Park an email until ``snooze_until`` and record the resurface as
    an obligation due that day, with the Gmail message as evidence."""
    summary = google_connector.gmail_summary(user_id, payload.message_id)
    subject = summary.subject or "(no subject)"
    title = f"Revisit email: {subject}"[:200]
    item = add_obligation(
        user_id,
        ObligationCreate(
            title=title,
            due_date=payload.snooze_until,
            source="snooze",
            evidence_ids=[payload.message_id],
            notes=f"Snoozed from {summary.sender}. Resurfaces on {payload.snooze_until.isoformat()}.",
        ),
    )
    record = SnoozeRecord(
        id=uuid.uuid4().hex[:12],
        message_id=payload.message_id,
        subject=subject,
        sender=summary.sender,
        snooze_until=payload.snooze_until,
        obligation_id=item.id,
        status="active",
        created_at=_now(),
    )
    with _lock:
        _user(user_id)[record.id] = record.model_dump(mode="json")
        _dump()
    return record


def list_snoozes(user_id: str, *, today: date | None = None) -> list[SnoozeRecord]:
    with _lock:
        rows = [dict(row) for row in _user(user_id).values() if isinstance(row, dict)]
    records: list[SnoozeRecord] = []
    for raw in rows:
        record = SnoozeRecord.model_validate(raw)
        record.status = _derived_status(raw, today)
        records.append(record)
    return sorted(records, key=lambda item: (item.snooze_until, item.created_at))


def cancel_snooze(user_id: str, snooze_id: str) -> SnoozeRecord:
    with _lock:
        raw = _user(user_id).get(snooze_id)
        if not isinstance(raw, dict):
            raise LookupError(f"No snooze with id {snooze_id}")
        record = SnoozeRecord.model_validate(dict(raw))
        record.status = "cancelled"
        _user(user_id)[snooze_id] = record.model_dump(mode="json")
        _dump()
    if record.obligation_id:
        try:
            set_obligation_status(user_id, record.obligation_id, ObligationStatus.cancelled)
        except LookupError:
            pass
    return record


def _parse_date(raw: str) -> date | None:
    if not raw:
        return None
    try:
        parsed = parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        return None
    return parsed.date() if parsed is not None else None


def _name_from_address(header: str) -> str:
    header = (header or "").strip()
    if "<" in header:
        name = header.split("<", 1)[0].strip().strip('"')
        if name:
            return name
    match = re.search(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", header)
    return match.group(0) if match else header[:80]


def _followup_draft(subject: str, recipient: str, sent: date, locale: str) -> tuple[str, str]:
    if locale == "fa":
        draft_subject = f"پیگیری — {subject}" if subject else "پیگیری ایمیل"
        body = (
            f"سلام {recipient}،\n\n"
            f"در تاریخ {sent.isoformat()} در مورد «{subject}» ایمیل فرستادم و هنوز پاسخی نگرفته‌ام. "
            "لطفاً بفرمایید وضعیت این موضوع چیست؟\n\n"
            "متشکرم."
        )
        return draft_subject, body
    draft_subject = f"Follow-up — {subject}" if subject else "Following up on my email"
    body = (
        f"Hello {recipient},\n\n"
        f"I wrote on {sent.isoformat()} about \"{subject}\" and have not heard back yet. "
        "Could you let me know where this stands?\n\n"
        "Thank you."
    )
    return draft_subject, body


def find_unanswered(
    user_id: str, *, days: int = 3, limit: int = 20, locale: str = "en", today: date | None = None
) -> list[UnansweredThread]:
    """Sent emails with no reply within ``days``.

    Looks at the owner's sent mail, opens each thread and checks
    whether the last message is still the owner's own. A thread counts
    as unanswered only when the owner's message is at least ``days``
    old and nothing after it came from anyone else. Each hit carries a
    follow-up draft — a proposal, never a send.
    """
    safe_days = min(max(days, 1), 90)
    safe_limit = min(max(limit, 1), 20)
    as_of = today or date.today()
    me = google_connector.gmail_profile_email(user_id).lower()
    sent = google_connector.search_gmail(user_id, "in:sent", safe_limit)
    rows: list[UnansweredThread] = []
    seen_threads: set[str] = set()
    for message in sent:
        thread_id = message.thread_id or ""
        if not thread_id or thread_id in seen_threads:
            continue
        seen_threads.add(thread_id)
        thread = google_connector.gmail_thread(user_id, thread_id)
        if not thread:
            continue
        last = thread[-1]
        if me not in last.get("from", "").lower():
            continue  # someone replied — not unanswered
        sent_date = _parse_date(last.get("date", ""))
        if sent_date is None:
            continue
        waiting = (as_of - sent_date).days
        if waiting < safe_days:
            continue
        subject = message.subject or ""
        recipient = _name_from_address(last.get("to", "") or message.sender)
        draft_subject, draft_body = _followup_draft(subject, recipient, sent_date, locale)
        rows.append(
            UnansweredThread(
                thread_id=thread_id,
                message_id=message.id,
                subject=subject,
                recipient=recipient,
                sent_date=sent_date.isoformat(),
                days_waiting=waiting,
                draft_subject=draft_subject,
                draft_body=draft_body,
            )
        )
    return rows


_load()
