"""Promise Chaser tests: cadence math, draft content, authority shape."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app
from app.schemas.followup import FollowupStepKind
from app.schemas.life import PromiseCreate
from app.services import followup as followup_service
from app.services.life import add_promise

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def _promise(user_id: str, due: date | None, counterparty: str = "British Gas") -> str:
    item = add_promise(
        user_id,
        PromiseCreate(
            counterparty=counterparty,
            promise="Refund of £42.50 within 5 working days",
            due_date=due,
            evidence_ids=["msg-refund"],
        ),
    )
    return item.id


def test_cadence_dates_are_due_minus_3_due_plus_7_plus_14() -> None:
    today = date.today()
    due = today + timedelta(days=10)
    item = add_promise(
        "user-a",
        PromiseCreate(counterparty="Acme", promise="Fix it", due_date=due),
    )
    steps = followup_service.followup_steps(item, today)
    by_kind = {step.step: step for step in steps}
    assert by_kind[FollowupStepKind.check].due_date == due - timedelta(days=3)
    assert by_kind[FollowupStepKind.verify].due_date == due
    assert by_kind[FollowupStepKind.chase].due_date == due + timedelta(days=7)
    assert by_kind[FollowupStepKind.escalate].due_date == due + timedelta(days=14)
    assert by_kind[FollowupStepKind.check].state == "upcoming"
    assert by_kind[FollowupStepKind.verify].state == "upcoming"


def test_overdue_promise_marks_past_steps_overdue() -> None:
    today = date.today()
    due = today - timedelta(days=10)
    item = add_promise(
        "user-a",
        PromiseCreate(counterparty="Acme", promise="Fix it", due_date=due),
    )
    steps = followup_service.followup_steps(item, today)
    by_kind = {step.step: step for step in steps}
    assert by_kind[FollowupStepKind.check].state == "overdue"
    assert by_kind[FollowupStepKind.verify].state == "overdue"
    assert by_kind[FollowupStepKind.chase].state == "overdue"
    assert by_kind[FollowupStepKind.escalate].state == "upcoming"


def test_promise_without_a_date_gets_one_open_check_step() -> None:
    item = add_promise(
        "user-a",
        PromiseCreate(counterparty="Acme", promise="Fix it", due_date=None),
    )
    steps = followup_service.followup_steps(item)
    assert len(steps) == 1
    assert steps[0].step is FollowupStepKind.check
    assert steps[0].due_date is None


def test_draft_names_counterparty_promise_and_due_date() -> None:
    today = date.today()
    due = today + timedelta(days=2)
    item = add_promise(
        "user-a",
        PromiseCreate(
            counterparty="British Gas",
            promise="Refund of £42.50 within 5 working days",
            due_date=due,
        ),
    )
    draft = followup_service.draft_followup(item, FollowupStepKind.chase)
    assert "British Gas" in draft.body
    assert "£42.50" in draft.body
    assert due.isoformat() in draft.body
    assert draft.to_missing is True  # no recipient known without evidence


def test_draft_takes_recipient_from_evidence_sender() -> None:
    item = add_promise(
        "user-a",
        PromiseCreate(counterparty="Amazon UK", promise="Refund", due_date=date.today()),
    )
    draft = followup_service.draft_followup(
        item, FollowupStepKind.check, evidence_sender="Amazon UK <no-reply@amazon.co.uk>"
    )
    assert draft.to == "no-reply@amazon.co.uk"
    assert draft.to_missing is False


def test_draft_in_persian_when_locale_is_fa() -> None:
    item = add_promise(
        "user-a",
        PromiseCreate(counterparty="Acme", promise="Fix it", due_date=date.today()),
    )
    draft = followup_service.draft_followup(item, FollowupStepKind.chase, locale="fa")
    assert "پیگیری" in draft.subject


def test_followups_endpoint_lists_steps_and_is_owner_scoped() -> None:
    _as("user-a")
    due = date.today() + timedelta(days=5)
    promise_id = _promise("user-a", due)
    response = client.get(f"/api/v1/life/promises/{promise_id}/followups")
    assert response.status_code == 200
    assert len(response.json()) == 4

    _as("user-b")
    assert client.get(f"/api/v1/life/promises/{promise_id}/followups").status_code == 404


def test_draft_endpoint_returns_authority_proposal_and_sends_nothing() -> None:
    _as("user-a")
    due = date.today() + timedelta(days=5)
    promise_id = _promise("user-a", due)
    response = client.post(
        f"/api/v1/life/promises/{promise_id}/followups/chase/draft",
        json={"to": "billing@britishgas.co.uk"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["step"] == "chase"
    assert body["draft"]["to"] == "billing@britishgas.co.uk"
    assert "British Gas" in body["draft"]["body"]
    proposal = body["authority_proposal"]
    assert proposal["tool"] == "gmail.send"
    assert proposal["idempotency_key"] == f"followup:{promise_id}:chase"
    # Nothing was sent: no action exists and no obligation changed.
    assert client.get("/api/v1/authority/actions").json() == []


def test_draft_for_closed_promise_is_rejected() -> None:
    _as("user-a")
    promise_id = _promise("user-a", date.today() + timedelta(days=5))
    client.post(f"/api/v1/life/promises/{promise_id}/status?status=kept")
    response = client.post(
        f"/api/v1/life/promises/{promise_id}/followups/chase/draft", json={}
    )
    assert response.status_code == 409
