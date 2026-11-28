"""Deterministic missing-capability guidance — the "always answer" rule.

When Mahdi asks EchoMind something it must ALWAYS answer. Never silence,
never a blank empty space after his message. When it cannot do something
because a plugin / connection / key is missing, it must SAY SO in his
language, name exactly what is missing, and say what to do.

This module is deterministic and needs NO LLM — that is the point: the
"I can't do this yet" answer must work with no Gemini key. It runs in the
chat pipeline (``pillars.process_message`` and the ``/chat/stream``
endpoint) AFTER the deterministic intent layer and BEFORE any LLM call, so
a guidance reply is returned instead of calling the model or returning a
generic error.

Rules:
- a message that needs Instagram / YouTube / Bank / Drive / Docs / Sheets
  and that connector is not connected/configured -> a reply naming the
  connector, "connect it first", and where (the hub's Connect / Request
  access action);
- an open-ended message that needs the model while Gemini is unconfigured
  -> a reply with the exact 2 steps to set the Gemini key;
- a status check that raises is treated as unknown and the guidance is
  skipped (fail open to the existing behaviour) — a broken status read
  must never block the chat.

Replies are bilingual EN/FA: Persian when the user writes Persian (the
existing intent language detection), English otherwise. The not-signed-in
case is NOT handled here — the frontend keeps its honest sign-in error
for that case (the request never reaches this module without a user).
"""

from __future__ import annotations

from app.schemas.chat import ChatResponse, PillarId
from app.services import (
    docs_connector,
    drive_connector,
    gemini,
    google_connector,
    instagram_connector,
    sheets_connector,
    truelayer_connector,
    youtube_connector,
)
from app.services.intent import detect_language
from app.services.persian import normalize_fa

# ---------------------------------------------------------------------------
# Connector keyword detection (on the normalised message).
# ---------------------------------------------------------------------------

# A bare "drive" on its own usually means driving somewhere, not Google
# Drive — it only counts next to a file-ish word. "bank holiday" is not
# the bank connector either.
_DRIVE_FILE_WORDS = ("file", "folder", "document", "فایل", "پوشه", "سند", "اسناد")
_BANK_EXCLUSIONS = ("bank holiday", "تعطیلات بانکی", "تعطیلی بانکی")

# (connector id, keywords) — checked in this order on a tie.
_CONNECTOR_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("instagram", ("instagram", "اینستاگرام", "اینستا")),
    ("youtube", ("youtube", "یوتیوب")),
    ("bank", ("bank", "بانک", "truelayer", "true layer")),
    ("drive", ("google drive", "گوگل درایو", "درایو")),
    ("docs", ("google docs", "گوگل داکس", "داکس", "docs")),
    ("sheets", ("google sheets", "گوگل شیت", "شیت", "sheets", "spreadsheet", "صفحه گسترده")),
)

# The Google OAuth scope each Google-scope connector needs.
_CONNECTOR_SCOPES = {
    "youtube": youtube_connector.YOUTUBE_READONLY,
    "drive": drive_connector.DRIVE_READONLY,
    "docs": docs_connector.DOCS_READONLY,
    "sheets": sheets_connector.SHEETS_READONLY,
}

_GOOGLE_CONNECTORS = ("youtube", "drive", "docs", "sheets")

# ---------------------------------------------------------------------------
# Reply texts. Every message names the missing thing AND the fix step.
# ---------------------------------------------------------------------------

_MESSAGES: dict[str, dict[str, dict[str, str]]] = {
    "instagram": {
        "needs_connection": {
            "en": "Instagram isn't connected yet — connect it first. In the hub, tap Instagram, then press Connect and sign in. Then ask me again and I'll look.",
            "fa": "اینستاگرام هنوز وصل نیست — اول وصلش کن. توی هاب روی «اینستاگرام» بزن و «متصل کن» را بزن و وارد شو؛ بعد دوباره همین را بگو تا نگاه کنم.",
        },
        "needs_setup": {
            "en": "Instagram isn't set up yet — a Meta app has to be created first (client ID and secret), so I can't connect to Instagram until then. Once it's set up, connect it in the hub and ask me again.",
            "fa": "اینستاگرام هنوز راه‌اندازی نشده — اول باید یک Meta app ساخته شود (client ID و secret)؛ تا آن ساخته نشود نمی‌توانم به اینستاگرام وصل شوم. وقتی ساخته شد، توی هاب وصلش کن و دوباره بگو.",
        },
    },
    "youtube": {
        "needs_google": {
            "en": "Google isn't connected yet — connect it first. In the hub, tap Gmail, then press Connect and sign in with your Google account. Then ask me again.",
            "fa": "گوگل هنوز وصل نیست — اول وصلش کن. توی هاب روی «جیمیل» بزن و «متصل کن» را بزن و با حسابت وارد شو؛ بعد دوباره بگو.",
        },
        "needs_scope": {
            "en": "YouTube isn't connected — I don't have the YouTube permission yet. In the hub, tap YouTube, then press Request access and approve it with your Google account. Then ask me again.",
            "fa": "یوتیوب وصل نیست — دسترسی یوتیوب را هنوز نداده‌ای. توی هاب روی «یوتیوب» بزن و «درخواست دسترسی» را بزن و با حسابت تایید کن؛ بعد دوباره بگو.",
        },
        "needs_setup": {
            "en": "Google isn't set up yet on the server, so I can't connect to YouTube until the Google client is configured.",
            "fa": "گوگل هنوز روی سرور راه‌اندازی نشده، پس تا وقتی تنظیم نشود نمی‌توانم به یوتیوب وصل شوم.",
        },
    },
    "drive": {
        "needs_google": {
            "en": "Google isn't connected yet — connect it first. In the hub, tap Gmail, then press Connect and sign in with your Google account. Then ask me again.",
            "fa": "گوگل هنوز وصل نیست — اول وصلش کن. توی هاب روی «جیمیل» بزن و «متصل کن» را بزن و با حسابت وارد شو؛ بعد دوباره بگو.",
        },
        "needs_scope": {
            "en": "Drive isn't connected — I don't have the Drive permission yet. In the hub, tap Drive, then press Request access and approve it with your Google account. Then ask me again.",
            "fa": "درایو وصل نیست — دسترسی درایو را هنوز نداده‌ای. توی هاب روی «درایو» بزن و «درخواست دسترسی» را بزن و با حسابت تایید کن؛ بعد دوباره بگو.",
        },
        "needs_setup": {
            "en": "Google isn't set up yet on the server, so I can't connect to Drive until the Google client is configured.",
            "fa": "گوگل هنوز روی سرور راه‌اندازی نشده، پس تا وقتی تنظیم نشود نمی‌توانم به درایو وصل شوم.",
        },
    },
    "docs": {
        "needs_google": {
            "en": "Google isn't connected yet — connect it first. In the hub, tap Gmail, then press Connect and sign in with your Google account. Then ask me again.",
            "fa": "گوگل هنوز وصل نیست — اول وصلش کن. توی هاب روی «جیمیل» بزن و «متصل کن» را بزن و با حسابت وارد شو؛ بعد دوباره بگو.",
        },
        "needs_scope": {
            "en": "Docs isn't connected — I don't have the Docs permission yet. In the hub, tap Docs, then press Request access and approve it with your Google account. Then ask me again.",
            "fa": "داکس وصل نیست — دسترسی داکس را هنوز نداده‌ای. توی هاب روی «داکس» بزن و «درخواست دسترسی» را بزن و با حسابت تایید کن؛ بعد دوباره بگو.",
        },
        "needs_setup": {
            "en": "Google isn't set up yet on the server, so I can't connect to Docs until the Google client is configured.",
            "fa": "گوگل هنوز روی سرور راه‌اندازی نشده، پس تا وقتی تنظیم نشود نمی‌توانم به داکس وصل شوم.",
        },
    },
    "sheets": {
        "needs_google": {
            "en": "Google isn't connected yet — connect it first. In the hub, tap Gmail, then press Connect and sign in with your Google account. Then ask me again.",
            "fa": "گوگل هنوز وصل نیست — اول وصلش کن. توی هاب روی «جیمیل» بزن و «متصل کن» را بزن و با حسابت وارد شو؛ بعد دوباره بگو.",
        },
        "needs_scope": {
            "en": "Sheets isn't connected — I don't have the Sheets permission yet. In the hub, tap Sheets, then press Request access and approve it with your Google account. Then ask me again.",
            "fa": "شیت وصل نیست — دسترسی شیت را هنوز نداده‌ای. توی هاب روی «شیت» بزن و «درخواست دسترسی» را بزن و با حسابت تایید کن؛ بعد دوباره بگو.",
        },
        "needs_setup": {
            "en": "Google isn't set up yet on the server, so I can't connect to Sheets until the Google client is configured.",
            "fa": "گوگل هنوز روی سرور راه‌اندازی نشده، پس تا وقتی تنظیم نشود نمی‌توانم به شیت وصل شوم.",
        },
    },
    "bank": {
        "needs_connection": {
            "en": "Your bank isn't connected yet — connect it first. In the hub, tap Bank, then press Connect and approve the read-only consent. Then ask me again.",
            "fa": "بانکت هنوز وصل نیست — اول وصلش کن. توی هاب روی «بانک» بزن و «متصل کن» را بزن و دسترسی فقط-خواندنی را تایید کن؛ بعد دوباره بگو.",
        },
        "needs_setup": {
            "en": "Banking isn't set up yet — a TrueLayer account (client ID and secret) has to be created first, so I can't connect to your bank until then.",
            "fa": "بانک هنوز راه‌اندازی نشده — اول باید یک حساب TrueLayer ساخته شود (client ID و secret)؛ تا آن ساخته نشود نمی‌توانم به بانکت وصل شوم.",
        },
    },
    "gemini": {
        "missing_key": {
            "en": "I can't answer open questions yet — the Gemini key isn't set. Two steps, both free: 1. Go to aistudio.google.com/apikey, sign in with your Google account and press Create API key. 2. In Railway, open the echomind-production service, go to Variables, add GEMINI_API_KEY and press Save. The server restarts itself — then ask me again.",
            "fa": "هنوز نمی‌توانم به سوال‌های باز جواب بدهم — کلید Gemini گذاشته نشده. دو قدم، هر دو رایگان: ۱. به aistudio.google.com/apikey برو، با حساب گوگلت وارد شو و «Create API key» را بزن. ۲. در Railway سرویس echomind-production را باز کن، به Variables برو، GEMINI_API_KEY را اضافه کن و Save را بزن. سرور خودش ری‌استارت می‌شود — بعد دوباره بپرس.",
        },
    },
}


def _field(obj: object, name: str) -> object:
    """Read a field from a dict or a pydantic model, tolerantly."""
    if isinstance(obj, dict):
        return obj.get(name)
    return getattr(obj, name, None)


def _reply_lang(message: str, lang: str) -> str:
    """Persian when the user writes Persian, else the request locale."""
    if any("\u0600" <= ch <= "\u06ff" for ch in message):
        return "fa"
    if any(ch.isalpha() for ch in message):
        return "en"
    return lang if lang in ("en", "fa") else "en"


def _detect_connector(message: str) -> str | None:
    """Which connector (if any) the message is about. Earliest hit wins."""
    text = normalize_fa(message).lower()
    if any(ex in text for ex in _BANK_EXCLUSIONS):
        text = text.replace("bank holiday", " ").replace("تعطیلات بانکی", " ").replace(
            "تعطیلی بانکی", " "
        )
    best: str | None = None
    best_at: int | None = None
    for connector, keywords in _CONNECTOR_KEYWORDS:
        for keyword in keywords:
            at = text.find(keyword)
            if at == -1:
                continue
            if best_at is None or at < best_at:
                best, best_at = connector, at
    # Bare "drive" (not "google drive" / "درایو") only counts next to a
    # file-ish word — "drive to London" is not Google Drive.
    if "drive" in text:
        at = text.find("drive")
        if any(word in text for word in _DRIVE_FILE_WORDS):
            if best_at is None or at < best_at:
                best, best_at = "drive", at
    return best


def _simple_state(user_id: str, module: object) -> str:
    """ready / needs_connection / needs_setup / unknown, for a connector
    whose own status() already answers configured + connected."""
    try:
        status = module.status(user_id)  # type: ignore[attr-defined]
    except Exception:
        return "unknown"
    if not _field(status, "configured"):
        return "needs_setup"
    if not _field(status, "connected"):
        return "needs_connection"
    return "ready"


def _google_scope_state(user_id: str, module: object, scope: str) -> str:
    """ready / needs_google / needs_scope / needs_setup / unknown, for the
    connectors that ride the shared Google token (YouTube, Drive, Docs,
    Sheets). Distinguishes "Google not connected at all" from "connected
    but this scope was never granted"."""
    try:
        status = module.status(user_id)  # type: ignore[attr-defined]
    except Exception:
        return "unknown"
    if not _field(status, "configured"):
        return "needs_setup"
    if _field(status, "connected"):
        return "ready"
    try:
        google_status = google_connector.status(user_id)
    except Exception:
        return "needs_connection"
    if not _field(google_status, "connected"):
        return "needs_google"
    scopes = _field(google_status, "scopes") or []
    if scope not in scopes:
        return "needs_scope"
    return "needs_connection"


def _connector_state(user_id: str, connector: str) -> str:
    if connector == "instagram":
        return _simple_state(user_id, instagram_connector)
    if connector == "bank":
        return _simple_state(user_id, truelayer_connector)
    if connector in _GOOGLE_CONNECTORS:
        module = {
            "youtube": youtube_connector,
            "drive": drive_connector,
            "docs": docs_connector,
            "sheets": sheets_connector,
        }[connector]
        return _google_scope_state(user_id, module, _CONNECTOR_SCOPES[connector])
    return "unknown"


def _reply(
    kind: str,
    state: str,
    lang: str,
    connector: str | None,
    conversation_id: str = "",
    pillar: PillarId | None = None,
) -> ChatResponse:
    text = _MESSAGES[kind][state][lang]
    return ChatResponse(
        conversation_id=conversation_id,
        pillar=pillar if pillar is not None else PillarId.consumer_rights,
        title="EchoMind",
        message=text,
        steps=[],
        engine="guidance",
        metadata={
            "intent": "guidance",
            "deterministic": True,
            "guidance": kind,
            "connector": connector,
            "state": state,
        },
    )


def guidance_for_message(
    *,
    user_id: str,
    message: str,
    lang: str,
    conversation_id: str = "",
    pillar: PillarId | None = None,
) -> ChatResponse | None:
    """The guidance reply for this message, or None when nothing is
    missing and the message may go to the model as normal.

    Order: a missing connector the message needs beats the missing key,
    because the connector is the specific thing the message is about.
    """
    reply_lang = _reply_lang(message, lang)
    connector = _detect_connector(message)
    if connector is not None:
        state = _connector_state(user_id, connector)
        if state in ("needs_connection", "needs_setup", "needs_google", "needs_scope"):
            return _reply(connector, state, reply_lang, connector, conversation_id, pillar)
        if state == "unknown":
            return None  # status unreadable — fail open, do not block chat
        # ready: the connector is fine; the message may still need the model
    try:
        configured = gemini.is_configured()
    except Exception:
        configured = False
    if not configured:
        return _reply("gemini", "missing_key", reply_lang, None, conversation_id, pillar)
    return None
