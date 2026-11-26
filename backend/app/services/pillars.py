"""Outcome routing for EchoMind's current UK workflow engines."""

from __future__ import annotations

import re

from app.schemas.chat import ChatMetadata, ChatResponse, PillarId
from app.schemas.life import ObligationCreate
from app.schemas.projects import TaskCreate
from app.services import delegation as delegation_service
from app.services import google_connector as connector
from app.services import projects as projects_service
from app.services.briefing import today_brief
from app.services.gemini import generate_with_memory
from app.services.intent import understand
from app.services.life import add_obligation
from app.services.memory_engine import (
    active_tag_labels,
    build_personalized_prompt,
    last_pillar_for,
    record_turn,
)
from app.services.renewals import renewal_guard
from app.services.travel_guard import travel_guard

_PILLAR_FROM_INTENT = {
    "travel": PillarId.delay_repay,
    "delay_repay": PillarId.delay_repay,
    "rights": PillarId.consumer_rights,
    "consumer_rights": PillarId.consumer_rights,
    "financial": PillarId.overdraft_shield,
    "shield": PillarId.overdraft_shield,
    "overdraft_shield": PillarId.overdraft_shield,
}

_DELAY_RE = re.compile(
    r"delay\s*repay|train|rail|flight|journey|station|"
    r"تأخیر|تاخیر|قطار|پرواز|سفر|بلیت|بلیط",
    re.IGNORECASE,
)
_RIGHTS_RE = re.compile(
    r"consumer|refund|faulty|warranty|retail|purchase|contract|"
    r"حقوق\s*مصرف|مرجوع|گارانتی|خرید|فروشگاه|قرارداد",
    re.IGNORECASE,
)
_OVERDRAFT_RE = re.compile(
    r"overdraft|overdrawn|bank\s*fee|unarranged|arranged overdraft|"
    r"اضافه\s*برداشت|کارمزد|بانک|حساب",
    re.IGNORECASE,
)

_PACKS: dict[PillarId, dict[str, dict[str, object]]] = {
    PillarId.delay_repay: {
        "en": {
            "title": "Delay Repay",
            "message": "I can help you check a Delay Repay claim and keep the evidence and follow-up together.",
            "steps": [
                "Record the scheduled and actual arrival times, operator and service.",
                "Keep the ticket, booking reference and delay evidence.",
                "Prepare the operator claim within its published deadline.",
                "Track the response and escalate if the refusal is not properly explained.",
            ],
        },
        "fa": {
            "title": "جبران تأخیر",
            "message": "می‌توانم ادعای Delay Repay را بررسی کنم و مدرک و پیگیری را کنار هم نگه دارم.",
            "steps": ["زمان‌ها و شرکت را ثبت کن.", "بلیت و مدرک تأخیر را نگه دار.", "ادعا را آماده کن.", "پاسخ را پیگیری و در صورت نیاز ارجاع کن."],
        },
    },
    PillarId.consumer_rights: {
        "en": {
            "title": "Consumer Rights",
            "message": "I can help structure the evidence, remedy request and follow-up under the current UK consumer-rights workflow.",
            "steps": [
                "Record what was bought, when and what went wrong.",
                "Choose the remedy you want and keep evidence.",
                "Send a concise written request to the seller.",
                "Track promises, deadlines and escalation options.",
            ],
        },
        "fa": {
            "title": "حقوق مصرف‌کننده",
            "message": "می‌توانم مدرک، خواسته و پیگیری پرونده حقوق مصرف‌کننده را ساختاربندی کنم.",
            "steps": ["خرید و ایراد را ثبت کن.", "خواسته و مدارک را مشخص کن.", "درخواست کتبی آماده کن.", "قول‌ها و مهلت‌ها را پیگیری کن."],
        },
    },
    PillarId.overdraft_shield: {
        "en": {
            "title": "Overdraft Shield",
            "message": "I can help organise unexpected bank fees, evidence, complaint steps and follow-up.",
            "steps": [
                "Record dates, amounts and account context.",
                "Ask the bank for a written explanation and remedy.",
                "Record vulnerability or financial-difficulty context where relevant.",
                "Track the complaint and escalation path.",
            ],
        },
        "fa": {
            "title": "سپر اضافه برداشت",
            "message": "می‌توانم کارمزد، مدرک، شکایت و پیگیری بانکی را منظم کنم.",
            "steps": ["تاریخ و مبلغ را ثبت کن.", "توضیح و جبران بخواه.", "شرایط مالی مرتبط را ثبت کن.", "شکایت و ارجاع را پیگیری کن."],
        },
    },
}


def _score(message: str) -> dict[PillarId, int]:
    return {
        PillarId.delay_repay: len(_DELAY_RE.findall(message)),
        PillarId.consumer_rights: len(_RIGHTS_RE.findall(message)),
        PillarId.overdraft_shield: len(_OVERDRAFT_RE.findall(message)),
    }


def classify_pillar(
    user_id: str,
    message: str,
    metadata: ChatMetadata,
    conversation_id: str | None = None,
) -> PillarId:
    intent = (metadata.intent or "").strip().lower()
    if intent in _PILLAR_FROM_INTENT:
        return _PILLAR_FROM_INTENT[intent]

    scores = _score(message)
    best = max(scores, key=scores.get)
    if scores[best] > 0:
        return best

    previous = last_pillar_for(user_id, conversation_id)
    if previous:
        try:
            return PillarId(previous)
        except ValueError:
            pass

    tags = set(active_tag_labels(user_id))
    if tags & {"travel", "commute", "train", "delay"}:
        return PillarId.delay_repay
    if tags & {"overdraft", "bank", "shield"}:
        return PillarId.overdraft_shield
    return PillarId.consumer_rights


def _copy(locale: str, en: str, fa: str) -> str:
    return fa if locale == "fa" else en


def _run_intent(
    user_id: str,
    message: str,
    lang: str,
    conversation_id: str,
    pillar: PillarId,
    pack: dict[str, object],
) -> ChatResponse | None:
    """Deterministic intent-first branch. Returns a reply when the message
    is a structured request (brief, renewals, trips, add an obligation,
    delegate to a project, confirm a task, greeting). Returns None when
    the message needs the open-ended path — behaviour is then identical
    to before this branch existed."""
    result = understand(message, lang)
    if result.confidence != "high":
        return None
    intent = result.intent
    meta: dict[str, object] = {"intent": intent, "deterministic": True}
    title = str(pack["title"])

    def reply(text: str, steps: list[str], extra: dict[str, object] | None = None) -> ChatResponse:
        record_turn(user_id, conversation_id, "user", message, pillar.value)
        record_turn(user_id, conversation_id, "assistant", text, pillar.value)
        merged = dict(meta)
        if extra:
            merged.update(extra)
        return ChatResponse(
            conversation_id=conversation_id,
            pillar=pillar,
            title=title,
            message=text,
            steps=steps,
            engine="intent",
            status="ok",
            metadata=merged,
        )

    if intent == "greeting":
        return reply(
            _copy(
                lang,
                "Hello! I can track your deadlines, promises, claims and projects. "
                "Try 'What do I have today?' or 'In project EchoMind, check the latest commit'.",
                "سلام! می‌توانم مهلت‌ها، قول‌ها، ادعاها و پروژه‌هایت را پیگیری کنم. "
                "مثلاً بگو «امروز چی دارم؟» یا «برو تو پروژه اکومایند آخرین کامیت رو چک کن».",
            ),
            [],
        )
    if intent == "brief":
        brief = today_brief(user_id, lang)
        if not brief.items:
            return reply(_copy(lang, "Nothing needs you today.", "امروز چیزی برای پیگیری نیست."), [])
        steps = [
            f"{item.title} — {item.reason}" + (f" · {item.due_date.isoformat()}" if item.due_date else "")
            for item in brief.items[:5]
        ]
        return reply(_copy(lang, "Here's your day:", "امروز این‌ها را داری:"), steps)
    if intent == "renewal":
        guard = renewal_guard(user_id)
        if not guard.renewals:
            return reply(_copy(lang, "No renewals tracked yet.", "هنوز تمدیدی ثبت نشده است."), [])
        steps = [
            f"{item.title} — "
            + _copy(lang, f"decide by {item.decision_deadline or '—'}", f"تا {item.decision_deadline or '—'} تصمیم بگیر")
            + (f" (£{item.annual_cost_gbp}/year)" if item.annual_cost_gbp is not None else "")
            for item in guard.renewals[:5]
        ]
        return reply(
            _copy(
                lang,
                f"{len(guard.renewals)} renewal(s), £{guard.total_annual_cost_gbp} a year in total.",
                f"{len(guard.renewals)} تمدید، در مجموع £{guard.total_annual_cost_gbp} در سال.",
            ),
            steps,
        )
    if intent == "travel":
        try:
            guard = travel_guard(user_id)
        except (connector.ConnectorNotConnectedError, connector.ConnectorNotConfiguredError):
            return reply(
                _copy(lang, "Connect Google first to check trips.", "برای بررسی سفر اول گوگل را وصل کنید."),
                [],
            )
        if not guard.trips:
            return reply(_copy(lang, "No trips on your calendar.", "سفری در تقویم نیست."), [])
        steps = [f"{trip.summary} — {trip.detail}" for trip in guard.trips[:5]]
        return reply(_copy(lang, "Here's what your trips look like:", "وضعیت سفرهایت:"), steps)
    if intent == "obligation_add":
        title_text = str(result.entities.get("title") or message).strip()[:200]
        due = result.due_date
        item = add_obligation(
            user_id,
            ObligationCreate(title=title_text, due_date=due, source="chat"),
        )
        suffix = f" · {due.isoformat()}" if due else ""
        return reply(
            _copy(lang, f"Saved: {item.title}{suffix}", f"ثبت شد: {item.title}{suffix}"),
            [],
            extra={"obligation_id": item.id},
        )
    if intent == "delegate":
        name = str(result.entities.get("project_name") or "").strip()
        instruction = str(result.entities.get("instruction") or message).strip()
        project = projects_service.find_project_by_name(user_id, name) if name else None
        if project is None:
            owned = projects_service.list_projects(user_id)
            names = ", ".join(item.name for item in owned) if owned else _copy(lang, "none yet", "هنوز هیچی")
            return reply(
                _copy(
                    lang,
                    f"I couldn't find a project called '{name}'. Your projects: {names}.",
                    f"پروژه‌ای به نام «{name}» پیدا نکردم. پروژه‌های تو: {names}.",
                ),
                [],
            )
        task = delegation_service.create_task(
            user_id,
            project.id,
            TaskCreate(instruction=instruction, language=lang),
        )
        plan = "; ".join(step.summary for step in task.plan)
        return reply(
            _copy(
                lang,
                f"In project {project.name} I proposed: {plan}. Reply 'confirm' to run it.",
                f"در پروژه {project.name} این را پیشنهاد کردم: {plan}. برای اجرا بگو «تایید».",
            ),
            [step.summary for step in task.plan],
            extra={"task_id": task.id, "project_id": project.id},
        )
    if intent == "confirm":
        task = delegation_service.latest_proposed_task(user_id)
        if task is None:
            return reply(
                _copy(lang, "Nothing is waiting for confirmation.", "چیزی منتظر تایید نیست."),
                [],
            )
        done = delegation_service.confirm_task(user_id, task.id)
        if done.status == "done":
            return reply(_copy(lang, f"Done: {done.result}", f"انجام شد: {done.result}"), [], extra={"task_id": done.id})
        return reply(
            _copy(lang, f"I couldn't finish it: {done.result}", f"نمی‌توانم کامل انجامش دهم: {done.result}"),
            [],
            extra={"task_id": done.id},
        )
    if intent == "mail_search":
        query = str(result.entities.get("query") or message).strip()
        if not query:
            return reply(
                _copy(lang, "What should I search your email for?", "توی ایمیلت دنبال چی بگردم؟"),
                [],
            )
        try:
            hits = connector.search_gmail(user_id, query, 5)
        except (connector.ConnectorNotConnectedError, connector.ConnectorNotConfiguredError):
            return reply(
                _copy(lang, "Connect Google first to search your email.", "برای جستجو تو ایمیلت اول گوگل را وصل کنید."),
                [],
            )
        if not hits:
            return reply(
                _copy(lang, f"No emails matched '{query}'.", f"ایمیلی با «{query}» پیدا نشد."),
                [],
            )
        steps = [
            f"{hit.subject or '(no subject)'} — {hit.sender} · {hit.date}"
            for hit in hits
        ]
        return reply(
            _copy(
                lang,
                f"Found {len(hits)} email(s) for '{query}':",
                f"برای «{query}» این {len(hits)} ایمیل را پیدا کردم:",
            ),
            steps,
        )
    return None


def process_message(
    user_id: str,
    message: str,
    locale: str,
    conversation_id: str,
    metadata: ChatMetadata,
) -> ChatResponse:
    lang = "fa" if locale == "fa" else "en"
    pillar = classify_pillar(user_id, message, metadata, conversation_id)
    pack = _PACKS[pillar][lang]
    # Intent-first: structured requests (brief, renewals, trips, add an
    # obligation, delegate to a project, confirm, greeting) are answered
    # deterministically, in Persian or English, with no LLM and no key.
    # Anything else falls through to the existing Gemini/pack path.
    intent_reply = _run_intent(user_id, message, lang, conversation_id, pillar, pack)
    if intent_reply is not None:
        return intent_reply
    hints = [hint.strip() for hint in metadata.memory_hints if hint.strip()][:6]
    prompt = build_personalized_prompt(user_id, message, lang, hints, conversation_id)
    gemini = generate_with_memory(prompt)
    record_turn(user_id, conversation_id, "user", message, pillar.value)

    reply = str(pack["message"])
    generated = gemini.get("text")
    if isinstance(generated, str) and generated.strip():
        reply = generated.strip()
    elif hints:
        remembered = "; ".join(hints)
        reply = (
            f"{reply}\n\nآنچه به خاطر دارم: {remembered}"
            if lang == "fa"
            else f"{reply}\n\nWhat I remember: {remembered}"
        )

    record_turn(user_id, conversation_id, "assistant", reply, pillar.value)
    return ChatResponse(
        conversation_id=conversation_id,
        pillar=pillar,
        title=str(pack["title"]),
        message=reply,
        steps=list(pack["steps"]),
        engine="placeholder",
        status="ok",
        metadata={
            "intent": metadata.intent,
            "source": metadata.source,
            "attachment_count": len(metadata.attachment_names),
            "memory_hints": hints,
            "memory_injected": True,
            "gemini": {key: gemini[key] for key in ("status", "injected", "model", "prompt_chars") if key in gemini},
        },
    )
