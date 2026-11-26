"""Intent-first chat tests: structured Persian/English chat works with no LLM."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app
from app.schemas.chat import ChatMetadata
from app.schemas.life import ObligationCreate
from app.services.life import add_obligation
from app.services.pillars import process_message
from app.services.projects import create_project
from app.schemas.projects import ProjectCreate

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def _chat(user_id: str, message: str, locale: str = "fa"):
    return process_message(user_id, message, locale, "conv-1", ChatMetadata())


def test_greeting_answers_in_persian_without_gemini() -> None:
    reply = _chat("user-a", "سلام")
    assert reply.metadata.get("deterministic") is True
    assert "سلام" in reply.message
    assert reply.engine == "intent"


def test_brief_intent_returns_todays_items() -> None:
    today = date.today()
    add_obligation("user-a", ObligationCreate(title="Pay — Council tax", due_date=today, source="user"))
    reply = _chat("user-a", "امروز چی دارم؟")
    assert reply.metadata.get("intent") == "brief"
    assert any("Council tax" in step for step in reply.steps)


def test_brief_with_nothing_open_says_so() -> None:
    reply = _chat("user-a", "امروز چی دارم؟")
    assert "چیزی برای پیگیری نیست" in reply.message


def test_obligation_add_from_persian_chat() -> None:
    _as("user-a")
    today = date.today()
    reply = _chat("user-a", "یادم بنداز فردا قبض برق رو پرداخت کنم")
    assert reply.metadata.get("intent") == "obligation_add"
    assert "ثبت شد" in reply.message
    assert reply.metadata.get("obligation_id")
    stored = client.get("/api/v1/life/obligations").json()
    assert any(item["title"].endswith("قبض برق رو پرداخت کنم") for item in stored)


def test_delegate_proposes_and_confirm_runs_it() -> None:
    _as("user-a")
    create_project("user-a", ProjectCreate(name="EchoMind", kind="app", repo="mmhaidari2-hash/echomind"))
    reply = _chat("user-a", "برو تو پروژه اکومایند آخرین کامیت رو چک کن")
    assert reply.metadata.get("intent") == "delegate"
    assert "اکومایند" in reply.message or "EchoMind" in reply.message
    task_id = reply.metadata.get("task_id")
    assert task_id
    # The task is only proposed until the owner confirms it.
    task = client.get(f"/api/v1/projects/tasks/{task_id}").json()
    assert task["status"] == "proposed"
    confirmed = _chat("user-a", "تایید")
    assert confirmed.metadata.get("intent") == "confirm"
    assert "انجام شد" in confirmed.message or "نمی‌توانم" in confirmed.message


def test_delegate_unknown_project_lists_owned_projects() -> None:
    _as("user-a")
    create_project("user-a", ProjectCreate(name="EchoMind", kind="app"))
    reply = _chat("user-a", "برو تو پروژه فلان اینو انجام بده")
    assert "پیدا نکردم" in reply.message
    assert "EchoMind" in reply.message


def test_confirm_with_nothing_proposed_says_so() -> None:
    reply = _chat("user-a", "تایید")
    assert "منتظر تایید نیست" in reply.message


def test_unknown_message_falls_through_to_the_pack() -> None:
    reply = _chat("user-a", "what is the meaning of life?")
    assert reply.metadata.get("deterministic") is None
    assert reply.engine == "placeholder"
    assert reply.message  # the existing pillar pack message, unchanged


def test_understand_endpoint_is_owner_scoped() -> None:
    _as("user-a")
    response = client.post("/api/v1/chat/understand", json={"text": "امروز چی دارم؟", "locale": "fa"})
    assert response.status_code == 200
    assert response.json()["intent"] == "brief"
    assert response.json()["language"] == "fa"
