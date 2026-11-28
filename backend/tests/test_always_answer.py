"""Always-answer rule: EchoMind must ALWAYS answer, naming what is missing.

When a message needs a connector that is not connected/configured, or
needs the model while the Gemini key is missing, the reply must say so in
the user's language, name the missing thing, and say what to do — instead
of calling the LLM or returning a generic error. These tests assert the
reply text names the missing thing and the fix step, and that no LLM call
is attempted in those cases.
"""

import json

from fastapi.testclient import TestClient

from app.api.endpoints import chat as chat_module
from app.auth import require_user
from app.main import app
from app.schemas.chat import ChatMetadata
from app.services import guidance, pillars
from app.services.pillars import process_message

client = TestClient(app)


def _no_llm(*args, **kwargs):
    raise AssertionError("LLM must not be called for a guidance reply")


def _chat(user_id: str, message: str, locale: str = "fa"):
    return process_message(user_id, message, locale, "conv-1", ChatMetadata())


def _set_status(monkeypatch, module_name: str, status: dict):
    module = getattr(guidance, module_name)
    monkeypatch.setattr(module, "status", lambda user_id: dict(status))


def _set_google(monkeypatch, *, connected: bool, scopes: list | None = None):
    _set_status(
        monkeypatch,
        "google_connector",
        {"configured": True, "connected": connected, "scopes": scopes or []},
    )


def _parse_sse(text: str):
    """Parse SSE the way the frontend's stream parser does."""
    events = []
    for block in text.split("\n\n"):
        if not block.strip():
            continue
        event = None
        data = None
        for line in block.split("\n"):
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:"):
                data = json.loads(line[5:].strip())
        events.append((event, data))
    return events


# --- missing Instagram -----------------------------------------------

def test_instagram_missing_replies_with_guidance_no_llm(monkeypatch) -> None:
    monkeypatch.setattr(pillars, "generate_with_memory", _no_llm)
    _set_status(monkeypatch, "instagram_connector", {"configured": True, "connected": False})
    reply = _chat("user-a", "برو تو اینستاگرام آخرین چیزمو نگاه کن")
    assert reply.engine == "guidance"
    assert "اینستاگرام" in reply.message
    assert "متصل کن" in reply.message
    assert reply.metadata.get("connector") == "instagram"


def test_instagram_not_set_up_names_the_setup(monkeypatch) -> None:
    monkeypatch.setattr(pillars, "generate_with_memory", _no_llm)
    _set_status(monkeypatch, "instagram_connector", {"configured": False, "connected": False})
    reply = _chat("user-a", "برو تو اینستاگرام آخرین چیزمو نگاه کن")
    assert "اینستاگرام" in reply.message
    assert "Meta app" in reply.message


def test_instagram_connected_falls_through_to_gemini_guidance(monkeypatch) -> None:
    monkeypatch.setattr(pillars, "generate_with_memory", _no_llm)
    monkeypatch.setattr(guidance.gemini, "is_configured", lambda: False)
    _set_status(monkeypatch, "instagram_connector", {"configured": True, "connected": True, "username": "oldembermusic"})
    reply = _chat("user-a", "برو تو اینستاگرام آخرین چیزمو نگاه کن")
    assert "Gemini" in reply.message
    assert "aistudio.google.com/apikey" in reply.message


# --- Google-scope connectors ------------------------------------------

def test_youtube_scope_missing_asks_for_request_access(monkeypatch) -> None:
    monkeypatch.setattr(pillars, "generate_with_memory", _no_llm)
    _set_status(monkeypatch, "youtube_connector", {"configured": True, "connected": False, "scopes": []})
    _set_google(monkeypatch, connected=True, scopes=["https://www.googleapis.com/auth/gmail.readonly"])
    reply = _chat("user-a", "آخرین ویدیوی یوتیوبم رو نشون بده")
    assert "یوتیوب" in reply.message
    assert "درخواست دسترسی" in reply.message


def test_youtube_with_google_disconnected_asks_to_connect_google(monkeypatch) -> None:
    monkeypatch.setattr(pillars, "generate_with_memory", _no_llm)
    _set_status(monkeypatch, "youtube_connector", {"configured": True, "connected": False, "scopes": []})
    _set_google(monkeypatch, connected=False)
    reply = _chat("user-a", "آخرین ویدیوی یوتیوبم رو نشون بده")
    assert "گوگل" in reply.message
    assert "متصل کن" in reply.message


def test_drive_scope_missing_names_drive(monkeypatch) -> None:
    monkeypatch.setattr(pillars, "generate_with_memory", _no_llm)
    _set_status(monkeypatch, "drive_connector", {"configured": True, "connected": False, "scopes": []})
    _set_google(monkeypatch, connected=True, scopes=[])
    reply = _chat("user-a", "فایل قرارداد رو تو درایو پیدا کن")
    assert "درایو" in reply.message
    assert "درخواست دسترسی" in reply.message


# --- Bank --------------------------------------------------------------

def test_bank_not_set_up_names_truelayer(monkeypatch) -> None:
    monkeypatch.setattr(pillars, "generate_with_memory", _no_llm)
    _set_status(monkeypatch, "truelayer_connector", {"configured": False, "connected": False})
    reply = _chat("user-a", "موجودی بانکم چقدره؟")
    assert "بانک" in reply.message
    assert "TrueLayer" in reply.message


# --- missing Gemini key -------------------------------------------------

def test_open_ended_without_gemini_key_gives_the_two_steps(monkeypatch) -> None:
    monkeypatch.setattr(pillars, "generate_with_memory", _no_llm)
    monkeypatch.setattr(guidance.gemini, "is_configured", lambda: False)
    reply = _chat("user-a", "برام یه شعر بگو")
    assert reply.engine == "guidance"
    assert "Gemini" in reply.message
    assert "aistudio.google.com/apikey" in reply.message
    assert "GEMINI_API_KEY" in reply.message
    assert "echomind-production" in reply.message


def test_english_message_gets_english_guidance(monkeypatch) -> None:
    monkeypatch.setattr(pillars, "generate_with_memory", _no_llm)
    _set_status(monkeypatch, "instagram_connector", {"configured": True, "connected": False})
    reply = _chat("user-a", "look at my latest Instagram post", locale="en")
    assert "Instagram" in reply.message
    assert "Connect" in reply.message
    assert "اینستاگرام" not in reply.message


def test_gemini_configured_skips_guidance(monkeypatch) -> None:
    monkeypatch.setattr(guidance.gemini, "is_configured", lambda: True)
    monkeypatch.setattr(
        pillars,
        "generate_with_memory",
        lambda prompt: {
            "status": "ok",
            "text": "MODEL REPLY",
            "injected": False,
            "model": "gemini-test",
            "prompt_chars": 10,
        },
    )
    reply = _chat("user-a", "برام یه شعر بگو")
    assert "MODEL REPLY" in reply.message
    assert reply.engine != "guidance"


def test_configured_gemini_empty_reply_falls_through_to_the_pack(monkeypatch) -> None:
    # The pack fallback still exists: with the key configured but the
    # model returning nothing, the reply is the pillar pack message.
    monkeypatch.setattr(guidance.gemini, "is_configured", lambda: True)
    monkeypatch.setattr(
        pillars,
        "generate_with_memory",
        lambda prompt: {
            "status": "ok",
            "text": "",
            "injected": False,
            "model": "gemini-test",
            "prompt_chars": 10,
        },
    )
    reply = _chat("user-a", "what is the meaning of life?")
    assert reply.engine == "placeholder"
    assert reply.metadata.get("memory_injected") is True
    assert reply.message


# --- stream endpoint ----------------------------------------------------

def test_stream_instagram_guidance_renders_as_sse(monkeypatch) -> None:
    monkeypatch.setattr(chat_module, "stream_text", _no_llm)
    _set_status(monkeypatch, "instagram_connector", {"configured": True, "connected": False})
    response = client.post(
        "/api/v1/chat/stream",
        json={"message": "برو تو اینستاگرام آخرین چیزمو نگاه کن", "locale": "fa"},
    )
    assert response.status_code == 200
    events = _parse_sse(response.text)
    kinds = [event for event, _ in events]
    assert kinds == ["meta", "delta", "done"]
    delta = next(data for event, data in events if event == "delta")
    assert "اینستاگرام" in delta["text"]
    assert "متصل کن" in delta["text"]
    meta = next(data for event, data in events if event == "meta")
    assert meta["conversation_id"]


def test_stream_open_ended_without_key_gets_guidance_not_503(monkeypatch) -> None:
    monkeypatch.setattr(chat_module, "stream_text", _no_llm)
    monkeypatch.setattr(guidance.gemini, "is_configured", lambda: False)
    response = client.post(
        "/api/v1/chat/stream",
        json={"message": "برام یه شعر بگو", "locale": "fa"},
    )
    assert response.status_code == 200
    events = _parse_sse(response.text)
    delta = next(data for event, data in events if event == "delta")
    assert "Gemini" in delta["text"]
    assert "aistudio.google.com/apikey" in delta["text"]


def test_stream_intent_reply_still_works_without_gemini(monkeypatch) -> None:
    monkeypatch.setattr(chat_module, "stream_text", _no_llm)
    response = client.post("/api/v1/chat/stream", json={"message": "سلام", "locale": "fa"})
    assert response.status_code == 200
    events = _parse_sse(response.text)
    delta = next(data for event, data in events if event == "delta")
    assert "سلام" in delta["text"]


# --- not signed in: the existing honest error is kept -------------------

def test_chat_without_sign_in_returns_401() -> None:
    app.dependency_overrides.pop(require_user, None)
    response = client.post("/api/v1/chat", json={"message": "سلام", "locale": "fa"})
    assert response.status_code == 401
