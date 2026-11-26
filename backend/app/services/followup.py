"""Promise Chaser: the follow-up cadence for a recorded promise.

A promise without a chase is just a note. This module computes, from a
promise's due date, the deterministic follow-up steps (check -> verify ->
chase -> escalate) and drafts the chase email for one step. It never sends
anything: the draft is proposed through Bounded Authority (gmail.send) and
only goes out when the owner confirms it.

Cadence (all dates are calendar dates, no LLM, no guessing):
- check    : 3 days before the due date — "is this on track?"
- verify   : on the due date — "did it happen?"
- chase    : 7 days after the due date — polite chase, evidence attached
- escalate : 14 days after the due date — formal chase, next step named
A promise with no due date gets a single open "check" step with no date.
"""

from __future__ import annotations

import re
from datetime import date, timedelta

from app.schemas.followup import FollowupDraft, FollowupStep, FollowupStepKind
from app.schemas.life import PromiseRecord

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")


def _copy(locale: str, en: str, fa: str) -> str:
    return fa if locale == "fa" else en


def _step_id(promise_id: str, step: FollowupStepKind) -> str:
    return f"{promise_id}:{step.value}"


def followup_steps(promise: PromiseRecord, today: date | None = None) -> list[FollowupStep]:
    as_of = today or date.today()
    if promise.due_date is None:
        return [
            FollowupStep(
                id=_step_id(promise.id, FollowupStepKind.check),
                step=FollowupStepKind.check,
                due_date=None,
                label="Check in on this promise",
                detail=f"Ask {promise.counterparty} whether the promise is on track.",
                state="upcoming",
            )
        ]
    due = promise.due_date
    plan: list[tuple[FollowupStepKind, date, str, str]] = [
        (
            FollowupStepKind.check,
            due - timedelta(days=3),
            "Check before the due date",
            f"Ask {promise.counterparty} whether the promise is on track.",
        ),
        (
            FollowupStepKind.verify,
            due,
            "Verify on the due date",
            f"Check whether {promise.counterparty} did what was promised.",
        ),
        (
            FollowupStepKind.chase,
            due + timedelta(days=7),
            "Chase — one week overdue",
            f"The promise is a week overdue. Send a polite chase with the evidence.",
        ),
        (
            FollowupStepKind.escalate,
            due + timedelta(days=14),
            "Escalate — two weeks overdue",
            "Two weeks overdue. Send a formal chase and name the next step "
            "(regulator, ombudsman or small claim).",
        ),
    ]
    steps: list[FollowupStep] = []
    for kind, when, label, detail in plan:
        if as_of < when:
            state = "upcoming"
        elif as_of == when:
            state = "due"
        else:
            state = "overdue"
        steps.append(
            FollowupStep(id=_step_id(promise.id, kind), step=kind, due_date=when, label=label, detail=detail, state=state)
        )
    return steps


def _recipient_from_evidence(evidence_sender: str | None) -> str:
    if not evidence_sender:
        return ""
    match = _EMAIL_RE.search(evidence_sender)
    return match.group(0) if match else ""


def draft_followup(
    promise: PromiseRecord,
    step: FollowupStepKind,
    *,
    to: str | None = None,
    locale: str = "en",
    evidence_sender: str | None = None,
) -> FollowupDraft:
    recipient = (to or "").strip() or _recipient_from_evidence(evidence_sender)
    due_text = promise.due_date.isoformat() if promise.due_date else "no date was set"
    if step is FollowupStepKind.check:
        subject = _copy(
            locale,
            f"Checking in — {promise.promise[:60]}",
            f"پیگیری — {promise.promise[:60]}",
        )
        body = _copy(
            locale,
            f"Hello {promise.counterparty},\n\n"
            f"I am checking in on the following, which was due on {due_text}:\n"
            f"\"{promise.promise}\"\n\n"
            "Could you confirm whether this is on track?\n\n"
            "Thank you.",
            f"سلام {promise.counterparty}،\n\n"
            f"در مورد زیر که موعد آن {due_text} بود پیگیری می‌کنم:\n"
            f"«{promise.promise}»\n\n"
            "لطفاً تایید کنید که آیا در مسیر انجام است؟\n\n"
            "متشکرم.",
        )
    elif step is FollowupStepKind.verify:
        subject = _copy(
            locale,
            f"Due today — {promise.promise[:60]}",
            f"موعد امروز — {promise.promise[:60]}",
        )
        body = _copy(
            locale,
            f"Hello {promise.counterparty},\n\n"
            f"This was due today ({due_text}):\n"
            f"\"{promise.promise}\"\n\n"
            "Could you confirm whether it has been done?\n\n"
            "Thank you.",
            f"سلام {promise.counterparty}،\n\n"
            f"این مورد امروز موعدش بود ({due_text}):\n"
            f"«{promise.promise}»\n\n"
            "لطفاً تایید کنید که انجام شده است یا نه؟\n\n"
            "متشکرم.",
        )
    elif step is FollowupStepKind.chase:
        subject = _copy(
            locale,
            f"Follow-up — {promise.promise[:60]}",
            f"پیگیری — {promise.promise[:60]}",
        )
        body = _copy(
            locale,
            f"Hello {promise.counterparty},\n\n"
            f"On {due_text} you promised:\n"
            f"\"{promise.promise}\"\n\n"
            "That date has now passed and I have not received it. "
            "Could you please update me on when it will be done?\n\n"
            "Thank you.",
            f"سلام {promise.counterparty}،\n\n"
            f"در تاریخ {due_text} شما قول دادید:\n"
            f"«{promise.promise}»\n\n"
            "این تاریخ گذشته و من هنوز آن را دریافت نکرده‌ام. "
            "لطفاً بفرمایید چه زمانی انجام می‌شود؟\n\n"
            "متشکرم.",
        )
    else:
        subject = _copy(
            locale,
            f"Second follow-up — {promise.promise[:60]}",
            f"پیگیری دوم — {promise.promise[:60]}",
        )
        body = _copy(
            locale,
            f"Hello {promise.counterparty},\n\n"
            f"This is my second follow-up. On {due_text} you promised:\n"
            f"\"{promise.promise}\"\n\n"
            "Two weeks have passed since that date. If this is not resolved "
            "promptly I will take the next step available to me (regulator, "
            "ombudsman or small claim, as applicable).\n\n"
            "Please reply with a firm date.",
            f"سلام {promise.counterparty}،\n\n"
            f"این دومین پیگیری من است. در تاریخ {due_text} شما قول دادید:\n"
            f"«{promise.promise}»\n\n"
            "دو هفته از آن تاریخ گذشته است. اگر به‌زودی حل نشود، "
            "قدم بعدی را برمی‌دارم (مرجع نظارتی، آمبودزمان یا دادگاه کوچک، حسب مورد).\n\n"
            "لطفاً یک تاریخ قطعی اعلام کنید.",
        )
    return FollowupDraft(to=recipient, subject=subject, body=body, to_missing=not recipient)
