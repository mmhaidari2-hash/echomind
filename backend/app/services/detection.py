"""Inbox Watch: detect obligations and promises from the owner's Gmail.

This is the Obligation Engine's detection half. Nothing here creates an
obligation or a promise, and nothing here sends, trashes or changes mail.
It only reads recent Gmail (gmail.readonly) and returns *proposals* with
their evidence attached. A proposal becomes real only when the owner
confirms it through the Bounded Authority flow (tool life.create_obligation
or life.create_promise), which writes the audit trail.

Detectors are deterministic rules over subject/sender/snippet, not an LLM:
a deadline must never be hallucinated. When a message does not state the
underlying date, the due date is estimated from the email date and marked
as estimated in the proposal and its reason text.
"""

from __future__ import annotations

import hashlib
import re
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

from app.schemas.connectors import GmailMessageSummary
from app.schemas.detection import (
    DetectionKind,
    DetectionProposal,
    DetectionScanResult,
    DetectionStatus,
    DetectionTarget,
)
from app.services.delay_repay import CLAIM_DEADLINE_DAYS, OPERATORS
from app.services.google_connector import recent_gmail
from app.services.life import dismissed_detection_ids, recorded_evidence_ids

_MONTHS = {
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3,
    "april": 4, "apr": 4, "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
    "august": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10, "november": 11, "nov": 11, "december": 12, "dec": 12,
}
_MONTH_NAMES = "|".join(sorted(_MONTHS, key=len, reverse=True))

_DATE_PATTERNS = (
    re.compile(r"(\d{4})-(\d{2})-(\d{2})"),
    re.compile(rf"(\d{{1,2}})\s+({_MONTH_NAMES})\s+(\d{{4}})", re.IGNORECASE),
    re.compile(rf"({_MONTH_NAMES})\s+(\d{{1,2}}),?\s+(\d{{4}})", re.IGNORECASE),
    re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})"),  # UK day-first
)
_AMOUNT_RE = re.compile(r"£\s*(\d+(?:\.\d{1,2})?)")

_RAIL_WORDS = ("train", "rail", "station", "journey", "delay repay", "delayrepay")
_DELAY_WORDS = ("delayed", "delay", "cancelled", "cancellation", "disruption", "disrupted")
_PAYMENT_DUE_PHRASES = (
    "payment due", "amount due", "balance due", "your bill is due",
    "payment is due", "please pay by", "direct debit",
)


def _mentions_payment_due(lowered: str) -> bool:
    if any(phrase in lowered for phrase in _PAYMENT_DUE_PHRASES):
        return True
    # "Pay by ..." on its own is too generic (e.g. "pay by card"); it only
    # counts as a deadline when the message also talks about a due date.
    return "pay by" in lowered and "due" in lowered


_PAYMENT_RECEIVED_PHRASES = (
    "payment received", "we received your payment", "thank you for your payment",
    "payment successful", "paid in full",
)
_REFUND_ISSUED_WORDS = (
    "refund issued", "refund processed", "refund is on its way",
    "will be refunded", "have refunded", "has been refunded",
    "refund has been", "we have refunded", "refunded",
    "refund has been processed", "refund is being processed",
    "refund has been issued", "refund approved",
)
_RENEWAL_PHRASES = ("renewal", "renews on", "your policy renews", "subscription renews")
_RENEWED_DONE_PHRASES = ("has been renewed", "was renewed", "successfully renewed")


def _find_date(text: str) -> date | None:
    for pattern in _DATE_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        try:
            groups = match.groups()
            if pattern is _DATE_PATTERNS[0]:
                year, month, day = (int(groups[0]), int(groups[1]), int(groups[2]))
            elif pattern is _DATE_PATTERNS[1]:
                day, month, year = int(groups[0]), _MONTHS[groups[1].lower()], int(groups[2])
            elif pattern is _DATE_PATTERNS[2]:
                month, day, year = _MONTHS[groups[0].lower()], int(groups[1]), int(groups[2])
            else:
                day, month, year = int(groups[0]), int(groups[1]), int(groups[2])
            return date(year, month, day)
        except (ValueError, KeyError):
            continue
    return None


def _email_date(raw: str) -> date | None:
    if not raw:
        return None
    try:
        parsed = parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        return None
    if parsed is None:
        return None
    return parsed.date()


def _find_amount(text: str) -> str | None:
    match = _AMOUNT_RE.search(text)
    return match.group(1) if match else None


def _organisation(sender: str) -> str:
    sender = (sender or "").strip()
    if "<" in sender:
        name = sender.split("<", 1)[0].strip().strip('"')
        if name:
            return name
    if "@" in sender:
        domain = sender.rsplit("@", 1)[1].strip().strip(">")
        host = domain.split(".", 1)[0]
        if host:
            return host.replace("-", " ").title()
    return sender[:80] if sender else "Unknown sender"


def _proposal_id(message_id: str, kind: DetectionKind, title: str) -> str:
    raw = f"{message_id}|{kind.value}|{title}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:16]


def _operator_claim(text: str) -> tuple[str, str | None] | None:
    lowered = text.lower()
    for operator in OPERATORS:
        if operator.id == "other":
            continue
        # The short ids (e.g. "ga") must match as whole words, otherwise
        # they false-positive inside ordinary words ("organise", "Gas").
        if operator.name.lower() in lowered or re.search(rf"\b{re.escape(operator.id)}\b", lowered):
            return operator.name, operator.claim_url
    return None


def _detect_delay(message: GmailMessageSummary, today: date) -> DetectionProposal | None:
    text = f"{message.subject} {message.snippet}"
    lowered = text.lower()
    if not any(word in lowered for word in _DELAY_WORDS):
        return None
    operator = _operator_claim(f"{message.subject} {message.sender} {message.snippet}")
    rail_context = any(word in lowered for word in _RAIL_WORDS) or operator is not None
    if not rail_context:
        return None
    operator_name, claim_url = operator if operator else ("UK train operator", None)
    title = f"Claim Delay Repay — {operator_name}"
    journey = _find_date(text)
    email_day = _email_date(message.date)
    if journey is not None:
        due = journey + timedelta(days=CLAIM_DEADLINE_DAYS)
        estimated = False
        reason = (
            f"Your train was delayed or cancelled on {journey.isoformat()}. "
            f"Delay Repay claims close {CLAIM_DEADLINE_DAYS} days after travel."
        )
    elif email_day is not None:
        due = email_day + timedelta(days=CLAIM_DEADLINE_DAYS)
        estimated = True
        reason = (
            "Your train was delayed or cancelled. The email does not state the "
            "journey date, so the deadline is estimated as 28 days after this "
            "email — check the journey date before claiming."
        )
    else:
        due = today + timedelta(days=CLAIM_DEADLINE_DAYS)
        estimated = True
        reason = (
            "Your train was delayed or cancelled. No date could be read from the "
            "email, so the deadline is estimated as 28 days from today — check "
            "the journey date before claiming."
        )
    notes = f"Evidence: Gmail message {message.id}."
    if claim_url:
        notes += f" Claim form: {claim_url}"
    return DetectionProposal(
        id=_proposal_id(message.id, DetectionKind.delay_repay, title),
        kind=DetectionKind.delay_repay,
        target=DetectionTarget.obligation,
        title=title,
        due_date=due,
        due_date_estimated=estimated,
        reason=reason,
        confidence="high" if operator is not None else "medium",
        evidence_message_id=message.id,
        evidence_subject=message.subject,
        evidence_sender=message.sender,
        claim_url=claim_url,
        notes=notes,
    )


def _detect_payment_due(message: GmailMessageSummary, today: date) -> DetectionProposal | None:
    text = f"{message.subject} {message.snippet}"
    lowered = text.lower()
    if any(phrase in lowered for phrase in _PAYMENT_RECEIVED_PHRASES):
        return None
    if not _mentions_payment_due(lowered):
        return None
    org = _organisation(message.sender)
    amount = _find_amount(text)
    title = f"Pay {org} — £{amount}" if amount else f"Payment due — {org}"
    due = _find_date(text)
    reason = (
        f"This email says a payment to {org} is due"
        + (f" on {due.isoformat()}" if due else "")
        + (f" (£{amount})" if amount else "")
        + "."
    )
    return DetectionProposal(
        id=_proposal_id(message.id, DetectionKind.payment_due, title),
        kind=DetectionKind.payment_due,
        target=DetectionTarget.obligation,
        title=title,
        due_date=due,
        due_date_estimated=False,
        reason=reason,
        confidence="high" if due is not None else "medium",
        evidence_message_id=message.id,
        evidence_subject=message.subject,
        evidence_sender=message.sender,
        notes=f"Evidence: Gmail message {message.id}.",
    )


def _detect_refund(message: GmailMessageSummary, today: date) -> DetectionProposal | None:
    text = f"{message.subject} {message.snippet}"
    lowered = text.lower()
    if "refund" not in lowered:
        return None
    if not any(word in lowered for word in _REFUND_ISSUED_WORDS):
        return None
    org = _organisation(message.sender)
    amount = _find_amount(text)
    promise_text = f"Refund of £{amount} from {org}" if amount else f"Refund from {org}"
    due = _find_date(text)
    reason = (
        f"{org} says a refund is on its way"
        + (f" (£{amount})" if amount else "")
        + ". Track it until the money actually arrives."
    )
    return DetectionProposal(
        id=_proposal_id(message.id, DetectionKind.refund_promised, promise_text),
        kind=DetectionKind.refund_promised,
        target=DetectionTarget.promise,
        title=promise_text,
        due_date=due,
        due_date_estimated=False,
        counterparty=org,
        promise_text=promise_text,
        reason=reason,
        confidence="high" if amount else "medium",
        evidence_message_id=message.id,
        evidence_subject=message.subject,
        evidence_sender=message.sender,
        notes=f"Evidence: Gmail message {message.id}.",
    )


def _detect_renewal(message: GmailMessageSummary, today: date) -> DetectionProposal | None:
    text = f"{message.subject} {message.snippet}"
    lowered = text.lower()
    if any(phrase in lowered for phrase in _RENEWED_DONE_PHRASES):
        return None
    if not any(phrase in lowered for phrase in _RENEWAL_PHRASES):
        return None
    org = _organisation(message.sender)
    title = f"Renewal — {org}"
    due = _find_date(text)
    reason = (
        f"This email says something with {org} renews"
        + (f" on {due.isoformat()}" if due else "")
        + ". Check the price and whether you still want it."
    )
    return DetectionProposal(
        id=_proposal_id(message.id, DetectionKind.renewal, title),
        kind=DetectionKind.renewal,
        target=DetectionTarget.obligation,
        title=title,
        due_date=due,
        due_date_estimated=False,
        reason=reason,
        confidence="high" if due is not None else "medium",
        evidence_message_id=message.id,
        evidence_subject=message.subject,
        evidence_sender=message.sender,
        notes=f"Evidence: Gmail message {message.id}.",
    )


_DETECTORS = (_detect_delay, _detect_payment_due, _detect_refund, _detect_renewal)


def detect_message(message: GmailMessageSummary, today: date | None = None) -> list[DetectionProposal]:
    as_of = today or date.today()
    proposals: list[DetectionProposal] = []
    for detector in _DETECTORS:
        proposal = detector(message, as_of)
        if proposal is not None:
            proposals.append(proposal)
    return proposals


def scan_inbox(user_id: str, *, limit: int = 20, today: date | None = None) -> DetectionScanResult:
    as_of = today or date.today()
    messages = recent_gmail(user_id, limit)
    recorded = recorded_evidence_ids(user_id)
    dismissed = dismissed_detection_ids(user_id)
    proposals: list[DetectionProposal] = []
    seen: set[tuple[str, DetectionKind]] = set()
    for message in messages:
        for proposal in detect_message(message, as_of):
            key = (proposal.evidence_message_id, proposal.kind)
            if key in seen:
                continue
            seen.add(key)
            if proposal.id in dismissed:
                proposal.status = DetectionStatus.dismissed
            elif proposal.evidence_message_id in recorded:
                proposal.status = DetectionStatus.already_recorded
            proposals.append(proposal)
    return DetectionScanResult(
        scanned=len(messages),
        proposals=proposals,
        scanned_at=datetime.now(timezone.utc),
    )


def dismiss_proposal(user_id: str, proposal_id: str) -> None:
    from app.services.life import dismiss_detection

    dismiss_detection(user_id, proposal_id)
