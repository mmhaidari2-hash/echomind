"""Scheduled watches: CRUD, evaluation per trigger, accept/dismiss."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app
from app.schemas.connectors import GmailMessageSummary
from app.schemas.life import PromiseCreate
from app.services import watches as watches_service
from app.services.life import add_promise

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolate_watches(tmp_path):
    watches_service.use_store_path(tmp_path / "watches.json")
    yield


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def _watch(**overrides):
    body = {
        "name": "Avanti delays",
        "trigger": "gmail_query",
        "condition": {"query": "Avanti"},
        "action": "create_obligation",
    }
    body.update(overrides)
    return client.post("/api/v1/watches", json=body)


def test_watch_crud_and_owner_scoping() -> None:
    _as("user-a")
    created = _watch()
    assert created.status_code == 200
    watch_id = created.json()["id"]
    assert client.get("/api/v1/watches").json()[0]["name"] == "Avanti delays"
    _as("user-b")
    assert client.get("/api/v1/watches").json() == []
    assert client.get(f"/api/v1/watches/{watch_id}").status_code == 404


def test_watch_rejects_bad_trigger_and_missing_query() -> None:
    _as("user-a")
    # An unknown trigger is rejected by the schema itself (422).
    assert _watch(trigger="carrier_pigeon").status_code == 422
    # A gmail_query watch without a query, and an unanswered_mail watch
    # with an out-of-range day count, are rejected by validation (400).
    assert _watch(condition={}).status_code == 400
    assert _watch(trigger="unanswered_mail", condition={"days": 0}).status_code == 400


def test_gmail_query_watch_proposes_and_dedupes(monkeypatch) -> None:
    from app.services import google_connector

    def fake_search(user_id, query, limit=20):
        assert query == "Avanti"
        return [
            GmailMessageSummary(id="m1", thread_id="t1", subject="Your train was delayed", sender="Avanti <a@test>", date="", snippet=""),
            GmailMessageSummary(id="m2", thread_id="t2", subject="Newsletter", sender="Shop <s@test>", date="", snippet=""),
        ]

    monkeypatch.setattr(google_connector, "search_gmail", fake_search)
    _as("user-a")
    watch_id = _watch(condition={"query": "Avanti", "sender_contains": "avanti"}).json()["id"]
    first = client.post(f"/api/v1/watches/{watch_id}/evaluate")
    assert first.status_code == 200
    assert first.json()["new_proposals"] == 1
    assert first.json()["proposals"][0]["evidence_message_id"] == "m1"
    # Re-evaluating finds the same message but proposes nothing new.
    second = client.post(f"/api/v1/watches/{watch_id}/evaluate")
    assert second.json()["new_proposals"] == 0


def test_promise_overdue_watch_drafts_a_chase() -> None:
    _as("user-a")
    add_promise(
        "user-a",
        PromiseCreate(
            counterparty="Avanti",
            promise="Refund of £45.00",
            due_date=date.today() - timedelta(days=10),
        ),
    )
    watch_id = _watch(
        name="Overdue promises",
        trigger="promise_overdue",
        condition={},
        action="draft_followup",
    ).json()["id"]
    result = client.post(f"/api/v1/watches/{watch_id}/evaluate")
    assert result.status_code == 200
    assert result.json()["new_proposals"] == 1
    proposal = result.json()["proposals"][0]
    assert "Avanti" in proposal["title"]
    assert "Refund of" in proposal["draft_body"]


def test_accept_proposal_creates_obligation_with_draft(monkeypatch) -> None:
    from app.services import google_connector

    monkeypatch.setattr(
        google_connector,
        "search_gmail",
        lambda user_id, query, limit=20: [
            GmailMessageSummary(id="m1", thread_id="t1", subject="Refund update", sender="Shop <s@test>", date="", snippet=""),
        ],
    )
    _as("user-a")
    watch_id = _watch(condition={"query": "refund"}, action="draft_followup").json()["id"]
    evaluated = client.post(f"/api/v1/watches/{watch_id}/evaluate").json()
    proposal_id = evaluated["proposals"][0]["id"]
    accepted = client.post(f"/api/v1/watches/proposals/{proposal_id}/accept")
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "accepted"
    assert accepted.json()["obligation_id"]
    obligations = client.get("/api/v1/life/obligations").json()
    mine = [item for item in obligations if item["id"] == accepted.json()["obligation_id"]]
    assert mine and mine[0]["source"] == "watch"
    assert "Draft follow-up" in (mine[0]["notes"] or "")
    # Accepting twice is refused.
    again = client.post(f"/api/v1/watches/proposals/{proposal_id}/accept")
    assert again.status_code == 409


def test_dismiss_proposal(monkeypatch) -> None:
    from app.services import google_connector

    monkeypatch.setattr(
        google_connector,
        "search_gmail",
        lambda user_id, query, limit=20: [
            GmailMessageSummary(id="m1", thread_id="t1", subject="Refund update", sender="Shop <s@test>", date="", snippet=""),
        ],
    )
    _as("user-a")
    watch_id = _watch(condition={"query": "refund"}).json()["id"]
    evaluated = client.post(f"/api/v1/watches/{watch_id}/evaluate").json()
    proposal_id = evaluated["proposals"][0]["id"]
    dismissed = client.post(f"/api/v1/watches/proposals/{proposal_id}/dismiss")
    assert dismissed.status_code == 200
    assert dismissed.json()["status"] == "dismissed"


def test_evaluate_all_skips_disabled_watches(monkeypatch) -> None:
    from app.services import google_connector

    monkeypatch.setattr(
        google_connector,
        "search_gmail",
        lambda user_id, query, limit=20: [
            GmailMessageSummary(id="m1", thread_id="t1", subject="x", sender="Avanti <a@test>", date="", snippet=""),
        ],
    )
    _as("user-a")
    on_id = _watch(name="On", condition={"query": "Avanti"}).json()["id"]
    off_id = _watch(name="Off", condition={"query": "Avanti"}).json()["id"]
    client.post(f"/api/v1/watches/{off_id}/disable")
    results = client.post("/api/v1/watches/evaluate-all")
    assert results.status_code == 200
    assert [row["watch_id"] for row in results.json()] == [on_id]


def test_unanswered_watch_uses_the_detector(monkeypatch) -> None:
    import app.services.watches as watches_module
    from app.schemas.mail import UnansweredThread

    monkeypatch.setattr(
        watches_module,
        "find_unanswered",
        lambda user_id, days=3, limit=20, locale="en", today=None: [
            UnansweredThread(
                thread_id="t1",
                message_id="m1",
                subject="Quote",
                recipient="Kitchen Co",
                sent_date="2026-11-20",
                days_waiting=5,
                draft_subject="Follow-up — Quote",
                draft_body="Hello Kitchen Co, ...",
            )
        ],
    )
    _as("user-a")
    watch_id = _watch(
        name="Unanswered",
        trigger="unanswered_mail",
        condition={"days": 3},
        action="draft_followup",
    ).json()["id"]
    result = client.post(f"/api/v1/watches/{watch_id}/evaluate")
    assert result.status_code == 200
    assert result.json()["new_proposals"] == 1
    assert "Kitchen Co" in result.json()["proposals"][0]["title"]
