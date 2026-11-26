"""Intent layer: understand Persian and English the same way.

Typed Persian, typed English, mixed language, colloquial Persian and
spoken transcripts (voice input arrives as text) all land here first.
The layer is deterministic: normalise the text, match intent patterns,
extract entities (dates, money, project name, instruction). No LLM, no
network, no writes. The chat layer executes the returned action and
builds the bilingual reply.

What it does NOT do: open-ended conversation. A message with no
structured intent falls through to the existing Gemini/pack path in
pillars.py — that is where open-ended Persian understanding lives, and
it needs Mahdi's Gemini key. See docs/persian.md.
"""

from __future__ import annotations

import re
from datetime import date

from app.schemas.intent import IntentResult
from app.services.persian import detect_language, normalize_fa, parse_money_gbp, parse_relative_date

# Each entry: (intent, [patterns on the normalised text], action-kind).
# Patterns are checked in order; the first high-confidence match wins.
# "delegate" comes before "confirm": an instruction like
# "برو تو پروژه ... اینو انجام بده" is a delegation, not a confirmation.
_PATTERNS: tuple[tuple[str, tuple[str, ...], str], ...] = (
    (
        "delegate",
        ("برو تو پروژه", "تو پروژه", "در پروژه", "in project", "go to project", "do this in project", "in the project"),
        "create_task",
    ),
    (
        "confirm",
        ("تایید می کنم", "تایید کن", "تایید", "بله انجام بده", "انجام بده", "اوکی انجام بده",
         "confirm", "yes do it", "go ahead", "do it"),
        "confirm_task",
    ),
    (
        "brief",
        ("امروز چی دارم", "امروز چه دارم", "برنامه امروز", "امروز چیه", "صبح", "morning brief", "what do i have today", "today's brief", "what's today"),
        "brief",
    ),
    (
        "obligation_add",
        ("یادآوری کن", "یادم بنداز", "مهلت", "اضافه کن", "یادآوری", "remind me", "add a deadline", "add an obligation", "remind"),
        "create_obligation",
    ),
    (
        "promise_chase",
        ("پیگیری قول", "قول", "پیگیری", "chase the promise", "follow up the promise", "follow up on the promise", "chase"),
        "promise_chase",
    ),
    (
        "renewal",
        ("تمدید", "renewal", "renewals", "subscription"),
        "renewals",
    ),
    (
        "travel",
        ("سفر", "پرواز", "هتل", "trip", "flight", "hotel", "travel"),
        "travel_guard",
    ),
    (
        "delay_repay",
        ("تاخیر قطار", "تأخیر قطار", "قطار دیر", "قطار تاخیر", "پرواز دیر", "جبران تاخیر", "جبران تأخیر",
         "delay repay", "train delayed", "train delay", "flight delayed", "delayed train"),
        "delay_repay",
    ),
    (
        "case_file",
        ("حقوق مصرف", "مرجوع", "کالای خراب", "شکایت", "consumer rights", "faulty", "refund the", "return the"),
        "case_file",
    ),
    (
        "verify",
        ("بررسی کن", "شد یا نه", "انجام شد یا نه", "verify", "did it happen", "check whether"),
        "verify",
    ),
    (
        "evidence",
        ("مدرک", "مدارک", "پرونده", "evidence", "proof"),
        "evidence",
    ),
)

_GREETING_RE = re.compile(r"^(سلام|درود|صبح بخیر|عصر بخیر|hello|hi|hey|good morning|good evening)\b[.!؟?]*$", re.IGNORECASE)

_PROJECT_FA_RE = re.compile(r"پروژه\s+([^\s،,]+)")
_PROJECT_EN_RE = re.compile(r"project\s+([A-Za-z0-9][A-Za-z0-9_-]*)", re.IGNORECASE)

# Words that end a project name in Persian ("برو تو پروژه اکومایند اینو انجام بده"
# -> name "اکومایند", instruction "اینو انجام بده").
_PROJECT_STOPWORDS = {"اینو", "این", "اونو", "اون", "رو", "را"}


def _delegate_entities(norm: str, original: str) -> dict[str, object]:
    match = _PROJECT_FA_RE.search(norm)
    if match:
        raw_name = match.group(1).strip()
        parts = [part for part in raw_name.split() if part not in _PROJECT_STOPWORDS]
        name = " ".join(parts[:1])
        instruction = norm[match.end():].strip(" ،,.").strip()
        if not instruction:
            instruction = original.strip()
        return {"project_name": name, "instruction": instruction}
    match = _PROJECT_EN_RE.search(norm)
    if match:
        name = match.group(1)
        instruction = (norm[: match.start()] + " " + norm[match.end():]).strip(" ,.").strip()
        return {"project_name": name, "instruction": instruction or original.strip()}
    return {"project_name": "", "instruction": original.strip()}


def _obligation_entities(norm: str, original: str, today: date | None) -> dict[str, object]:
    title = original.strip()
    for trigger in ("یادآوری کن", "یادم بنداز", "اضافه کن", "مهلت", "remind me to", "remind me", "add a deadline", "add an obligation"):
        if trigger in norm:
            idx = norm.find(trigger)
            title = (norm[:idx] + norm[idx + len(trigger):]).strip(" ،,.").strip()
            break
    money = parse_money_gbp(norm)
    entities: dict[str, object] = {"title": title or original.strip()}
    if money is not None:
        entities["amount_gbp"] = money
    due = parse_relative_date(norm, today)
    if due is not None:
        entities["due_date"] = due.isoformat()
    return entities


def understand(text: str, locale: str = "en", today: date | None = None) -> IntentResult:
    norm = normalize_fa(text)
    language = detect_language(text)
    due = parse_relative_date(norm, today)
    if _GREETING_RE.match(norm.strip()):
        return IntentResult(
            intent="greeting", confidence="high", language=language,
            entities={}, action={"kind": "answer"}, due_date=due,
        )
    for intent, patterns, action_kind in _PATTERNS:
        for pattern in patterns:
            if pattern in norm.lower() or pattern in norm:
                entities: dict[str, object] = {}
                if intent == "delegate":
                    entities = _delegate_entities(norm, text)
                elif intent == "obligation_add":
                    entities = _obligation_entities(norm, text, today)
                elif intent == "brief":
                    entities = {"date": (due or (today or date.today())).isoformat()}
                confidence = "high" if len(pattern) >= 4 else "medium"
                return IntentResult(
                    intent=intent, confidence=confidence, language=language,
                    entities=entities, action={"kind": action_kind}, due_date=due,
                )
    return IntentResult(
        intent="unknown", confidence="low", language=language,
        entities={}, action={"kind": "answer"}, due_date=due,
    )
