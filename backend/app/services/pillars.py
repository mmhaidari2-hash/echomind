"""Placeholder response engine for EchoMind's three core pillars."""

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
            "message": (
                "I can help you check a Delay Repay claim. Most UK rail operators "
                "pay compensation when your train is late beyond their published threshold."
            ),
            "steps": [
                "Note the scheduled and actual arrival times, plus the operator and service.",
                "Keep your ticket, booking reference, and any delay alerts.",
                "Claim through the operator's Delay Repay form, usually within 28 days.",
                "If the claim is refused without a clear reason, escalate to the operator then Rail Ombudsman.",
            ],
        },
        "fa": {
            "title": "جبران تأخیر",
            "message": (
                "می‌توانم برای ادعای Delay Repay کمکتان کنم. بیشتر شرکت‌های ریلی بریتانیا "
                "اگر قطار از آستانه اعلام‌شده دیرتر برسد غرامت می‌پردازند."
            ),
            "steps": [
                "زمان برنامه‌ریزی‌شده و واقعی رسیدن، شرکت ریلی و شماره قطار را یادداشت کنید.",
                "بلیت، کد رزرو و هشدارهای تأخیر را نگه دارید.",
                "معمولاً ظرف ۲۸ روز از فرم Delay Repay همان شرکت استفاده کنید.",
                "اگر بدون دلیل روشن رد شد، ابتدا به شرکت و سپس به Rail Ombudsman پیگیری کنید.",
            ],
        },
    },
    PillarId.consumer_rights: {
        "en": {
            "title": "Consumer Rights",
            "message": (
                "UK consumer law gives you repair, replacement, or refund routes when "
                "goods or services are not as described, not fit for purpose, or not of satisfactory quality."
            ),
            "steps": [
                "Write down what you bought, when, and what went wrong, with photos if useful.",
                "Contact the seller first and state the remedy you want (repair, replace, or refund).",
                "If the seller refuses, cite the Consumer Rights Act 2015 in a short follow-up.",
                "Next steps can include an ADR scheme, your card issuer, or Citizens Advice / Trading Standards.",
            ],
        },
        "fa": {
            "title": "حقوق مصرف‌کننده",
            "message": (
                "قانون حقوق مصرف‌کننده بریتانیا برای کالا یا خدمت نامنطبق، غیرمناسب یا بی‌کیفیت "
                "مسیر تعمیر، تعویض یا بازپرداخت می‌دهد."
            ),
            "steps": [
                "چه خریدی، چه زمانی، و چه ایرادی داشته را با عکس در صورت نیاز ثبت کنید.",
                "اول با فروشنده تماس بگیرید و خواسته‌تان (تعمیر، تعویض یا بازپرداخت) را بگویید.",
                "اگر نپذیرفت، در پیام بعدی به Consumer Rights Act 2015 اشاره کنید.",
                "بعد می‌توانید سراغ ADR، صادرکننده کارت، یا Citizens Advice / Trading Standards بروید.",
            ],
        },
    },
    PillarId.overdraft_shield: {
        "en": {
            "title": "Overdraft Shield",
            "message": (
                "Overdraft Shield looks at unexpected arranged or unarranged overdraft fees "
                "and the steps you can take with your bank."
            ),
            "steps": [
                "List the fee dates, amounts, and whether the overdraft was arranged or unarranged.",
                "Ask the bank in writing to explain the charge and consider a goodwill refund.",
                "If you were struggling financially, say so clearly; banks must treat vulnerable customers fairly.",
                "If the bank will not help, complain formally and then consider the Financial Ombudsman Service.",
            ],
        },
        "fa": {
            "title": "سپر اضافه برداشت",
            "message": (
                "سپر اضافه برداشت به کارمزدهای غیرمنتظره اضافه برداشت ترتیبی یا غیرترتیبی "
                "و اقداماتی که می‌توانید با بانک انجام دهید نگاه می‌کند."
            ),
            "steps": [
                "تاریخ و مبلغ کارمزدها و نوع اضافه برداشت را فهرست کنید.",
                "کتبی از بانک توضیح بخواهید و درخواست بازپرداخت حسن‌نیت بدهید.",
                "اگر در فشار مالی بودید صریح بگویید؛ بانک باید با مشتری آسیب‌پذیر منصفانه رفتار کند.",
                "اگر کمک نکرد، شکایت رسمی کنید و سپس Financial Ombudsman Service را در نظر بگیرید.",
            ],
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
    previous = last_pillar_for(conversation_id)
    if previous:
        try:
            return PillarId(previous)
        except ValueError:
            pass
    tags = set(active_tag_labels())
    if tags & {"travel", "commute", "train", "delay"}:
        return PillarId.delay_repay
    if tags & {"overdraft", "bank", "shield"}:
        return PillarId.overdraft_shield
    return PillarId.consumer_rights


def process_message(
    message: str,
    locale: str,
    conversation_id: str,
    metadata: ChatMetadata,
) -> ChatResponse:
    lang = "fa" if locale == "fa" else "en"
    pillar = classify_pillar(message, metadata, conversation_id)
    pack = _PACKS[pillar][lang]
    hints = [hint.strip() for hint in metadata.memory_hints if hint.strip()][:6]
    prompt = build_personalized_prompt(message, lang, hints, conversation_id)
    gemini = generate_with_memory(prompt)
    record_turn(conversation_id, "user", message, pillar.value)
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
    record_turn(conversation_id, "assistant", reply, pillar.value)
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
