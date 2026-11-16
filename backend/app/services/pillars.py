"""Outcome routing for EchoMind's current UK workflow engines."""

from __future__ import annotations

import re

from app.schemas.chat import ChatMetadata, ChatResponse, PillarId
from app.services.gemini import generate_with_memory
from app.services.memory_engine import (
    active_tag_labels,
    build_personalized_prompt,
    last_pillar_for,
    record_turn,
)

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
