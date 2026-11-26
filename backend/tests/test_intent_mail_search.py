"""Mail-search intent: chat can search the Gmail archive with no LLM."""

from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app
from app.schemas.chat import ChatMetadata
from app.schemas.connectors import GmailMessageSummary
from app.services.intent import understand
from app.services.pillars import process_message

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def _chat(user_id: str, message: str, locale: str = "fa"):
    return process_message(user_id, message, locale, "conv-1", ChatMetadata())


def test_understand_mail_search_english() -> None:
    result = understand("search my email for Avanti refund", "en")
    assert result.intent == "mail_search"
    assert result.confidence == "high"
    assert result.entities.get("query") == "Avanti refund"


def test_understand_mail_search_persian() -> None:
    result = understand("ایمیلم رو بگرد تمدید بیمه", "fa")
    assert result.intent == "mail_search"
    assert result.entities.get("query") == "تمدید بیمه"


def test_mail_search_chat_answers_with_hits(monkeypatch) -> None:
    from app.services import google_connector

    monkeypatch.setattr(
        google_connector,
        "search_gmail",
        lambda user_id, query, limit=20: [
            GmailMessageSummary(
                id="m1",
                thread_id="t1",
                subject="Your Avanti refund",
                sender="Avanti <a@test>",
                date="Mon, 20 Nov 2026 10:00:00 +0000",
                snippet="refund issued",
            )
        ],
    )
    _as("user-a")
    reply = _chat("user-a", "search my email for Avanti refund", locale="en")
    assert reply.metadata.get("intent") == "mail_search"
    assert reply.metadata.get("deterministic") is True
    assert "Your Avanti refund" in " ".join(reply.steps)


def test_mail_search_chat_fails_closed_without_google() -> None:
    _as("user-a")
    reply = _chat("user-a", "search my email for Avanti refund", locale="en")
    assert reply.metadata.get("intent") == "mail_search"
    assert "Connect Google" in reply.message


def test_mail_search_chat_with_no_hits(monkeypatch) -> None:
    from app.services import google_connector

    monkeypatch.setattr(google_connector, "search_gmail", lambda user_id, query, limit=20: [])
    _as("user-a")
    reply = _chat("user-a", "search my email for nothing-here", locale="en")
    assert "No emails matched" in reply.message
