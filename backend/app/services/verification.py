"""Outcome Verifier: did it actually happen?

The Outcome Loop ends with "verify". This module verifies an obligation or
a promise against the owner's Gmail with deterministic signals — no LLM,
no guessing. It scans the recent mailbox (newest first) and returns the
first signal that matches the record:

- verified: a message says the thing happened (claim approved, payment
  received, refund in your account, renewal confirmed, work completed).
- failed: a message says it did not happen (claim rejected, payment
  failed, not eligible).
- awaiting: no matching message — the outcome is still open, not a lie.

A failed signal is only trusted when it names the same counterparty or
the same kind of outcome, so an unrelated rejection in the inbox does not
mark a promise broken. Results are persisted in the Life Graph.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from app.schemas.life import Obligation, PromiseRecord
from app.schemas.verification import VerificationResult
from app.services import google_connector as connector
from app.services.life import get_verification, list_obligations, list_promises, record_verification

_MAX_MESSAGES = 20

# (verified phrases, failed phrases) per outcome kind.
_SIGNALS: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "delay_repay": (
        ("claim approved", "compensation paid", "claim has been approved", "delay repay approved"),
        ("claim rejected", "claim denied", "not eligible for compensation", "claim was rejected"),
    ),
    "payment": (
        ("payment received", "thank you for your payment", "payment successful", "your payment has been received"),
        ("payment failed", "payment was declined", "payment unsuccessful", "could not take your payment"),
    ),
    "renewal": (
        ("renewal confirmed", "your policy has been renewed", "renewed successfully"),
        ("renewal failed", "could not renew", "renewal declined"),
    ),
    "refund": (
        ("refund received", "refund has been paid", "refunded to your", "money back in your account"),
        ("refund declined", "refund rejected", "refund not approved"),
    ),
    "generic": (
        ("confirmed", "completed", "done", "resolved", "all sorted"),
        ("rejected", "declined", "not eligible", "unsuccessful"),
    ),
}


def _kind_of_obligation(item: Obligation) -> str:
    text = f"{item.title} {item.notes or ''}".lower()
    if "delay repay" in text or "delay" in text and "train" in text:
        return "delay_repay"
    if text.startswith("pay") or "payment" in text:
        return "payment"
    if "renew" in text:
        return "renewal"
    return "generic"


def _kind_of_promise(item: PromiseRecord) -> str:
    text = f"{item.promise}".lower()
    if "refund" in text:
        return "refund"
    if "renew" in text:
        return "renewal"
    if "delay" in text or "compensation" in text:
        return "delay_repay"
    if "payment" in text:
        return "payment"
    return "generic"


def _counterparty_tokens(text: str) -> list[str]:
    tokens = [part for part in text.lower().replace("&", " ").split() if len(part) >= 4]
    return tokens[:3]


def _text_matches(text: str, kind: str, tokens: list[str]) -> tuple[str, str | None]:
    """Return (status, matched phrase) for one message body, or ("", None)."""
    verified_phrases, failed_phrases = _SIGNALS[kind]
    lower = text.lower()
    # A signal only counts when it names the same counterparty/operator or
    # the kind keyword itself appears in the message.
    anchor = any(token in lower for token in tokens) or kind.replace("_", " ") in lower
    if not anchor and kind == "generic":
        anchor = any(token in lower for token in tokens)
    if not anchor:
        return "", None
    for phrase in failed_phrases:
        if phrase in lower:
            return "failed", phrase
    for phrase in verified_phrases:
        if phrase in lower:
            return "verified", phrase
    return "", None


def verify_outcome(
    user_id: str,
    kind: str,
    source_id: str,
    today: date | None = None,
    *,
    _mail=None,
) -> VerificationResult:
    as_of = today or date.today()
    record: Obligation | PromiseRecord | None = None
    if kind == "obligation":
        record = next((item for item in list_obligations(user_id, include_closed=True) if item.id == source_id), None)
        outcome_kind = _kind_of_obligation(record) if record else "generic"
        anchor_text = record.title if record else ""
    else:
        record = next((item for item in list_promises(user_id, include_closed=True) if item.id == source_id), None)
        outcome_kind = _kind_of_promise(record) if record else "generic"
        anchor_text = f"{record.counterparty} {record.promise}" if record else ""
    if record is None:
        raise LookupError(f"No {kind} with id {source_id}")

    mail = _mail if _mail is not None else connector.recent_gmail
    messages = mail(user_id, _MAX_MESSAGES)
    tokens = _counterparty_tokens(anchor_text)
    result_status = "awaiting"
    evidence_id: str | None = None
    matched: str | None = None
    for message in messages:
        body = f"{message.subject} {message.snippet} {message.sender}"
        status, phrase = _text_matches(body, outcome_kind, tokens)
        if status:
            result_status = status
            evidence_id = message.id
            matched = phrase
            break
    detail = {
        "verified": "Evidence found in your inbox: the outcome happened.",
        "failed": "Evidence found in your inbox: the outcome did not happen.",
        "awaiting": "No matching evidence in the last 20 messages. The outcome is still open.",
    }[result_status]
    result = VerificationResult(
        source_id=source_id,
        kind=kind,
        status=result_status,
        evidence_message_id=evidence_id,
        matched_text=matched,
        checked_at=datetime.now(timezone.utc),
        detail=detail,
    )
    record_verification(user_id, source_id, result.model_dump(mode="json"))
    return result


def stored_verification(user_id: str, source_id: str) -> VerificationResult | None:
    raw = get_verification(user_id, source_id)
    if raw is None:
        return None
    return VerificationResult.model_validate(raw)
