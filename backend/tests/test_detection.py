"""Inbox Watch tests: Gmail detection -> proposal -> confirmed obligation.

The detectors are deterministic rules, so the unit tests use fixture
messages and never touch the network. Endpoint tests fake the Gmail
connector the same way the existing connector tests do.
"""

from datetime import date, timedelta
from email.utils import format_datetime
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app
from app.schemas.connectors import GmailMessageSummary
from app.services import detection as detection_service
from app.services import life as life_service
from app.services.google_connector import ConnectorNotConnectedError

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def _date_header(day: date) -> str:
    return format_datetime(datetime(day.year, day.month, day.day, 8, 15, tzinfo=timezone.utc))


def _msg(message_id: str, subject: str, sender: str, day: date, snippet: str) -> GmailMessageSummary:
    return GmailMessageSummary(
        id=message_id,
        thread_id=f"thread-{message_id}",
        subject=subject,
        sender=sender,
        date=_date_header(day),
        snippet=snippet,
    )


def _month_day(day: date) -> str:
    return f"{day.day} {day.strftime('%B')} {day.year}"


@pytest.fixture()
def inbox(monkeypatch: pytest.MonkeyPatch):
    today = date.today()
    messages = [
        _msg(
            "msg-delay",
            "Your train was delayed — Avanti West Coast",
            "Avanti West Coast <noreply@avantiwestcoast.co.uk>",
            today - timedelta(days=3),
            f"Your 08:15 from London Euston to Manchester Piccadilly was delayed "
            f"by 45 minutes on {_month_day(today - timedelta(days=3))}. You may be "
            "entitled to Delay Repay compensation.",
        ),
        _msg(
            "msg-bill",
            "Your payment is due",
            "British Gas <billing@britishgas.co.uk>",
            today,
            f"Your payment of £42.50 is due on {_month_day(today + timedelta(days=2))}. "
            "Please pay by this date to avoid a late fee.",
        ),
        _msg(
            "msg-refund",
            "Your refund is on its way",
            "Amazon UK <no-reply@amazon.co.uk>",
            today,
            "Your refund of £18.99 has been processed. The money will be refunded "
            "to your original payment method within 5 working days.",
        ),
        _msg(
            "msg-renewal",
            "Your policy renewal",
            "Aviva <renewals@aviva.com>",
            today,
            f"Your home insurance policy renews on {_month_day(today + timedelta(days=10))}. "
            "Your new premium is £212.00.",
        ),
        _msg(
            "msg-promo",
            "50% off this weekend only",
            "Shop <offers@shop.example>",
            today,
            "Huge sale on everything in store this weekend. Pay by card and save!",
        ),
        _msg(
            "msg-paid",
            "Payment received",
            "British Gas <billing@britishgas.co.uk>",
            today,
            "Thank you for your payment of £42.50. Your account is up to date.",
        ),
    ]
    monkeypatch.setattr(detection_service, "recent_gmail", lambda user_id, limit=20: messages[:limit])
    return messages


def test_delay_repay_proposal_uses_28_day_deadline(inbox) -> None:
    today = date.today()
    journey = today - timedelta(days=3)
    rows = detection_service.scan_inbox("user-a").proposals
    delay = [row for row in rows if row.kind.value == "delay_repay"]
    assert len(delay) == 1
    assert delay[0].target.value == "obligation"
    assert delay[0].due_date == journey + timedelta(days=28)
    assert delay[0].due_date_estimated is False
    assert "Avanti West Coast" in delay[0].title
    assert delay[0].claim_url is not None and "avanti" in delay[0].claim_url
    assert delay[0].evidence_message_id == "msg-delay"


def test_delay_without_journey_date_estimates_and_says_so(inbox) -> None:
    today = date.today()
    message = _msg(
        "msg-delay-nodate",
        "Sorry — your train was delayed",
        "Southern <hello@southernrailway.com>",
        today - timedelta(days=1),
        "Your train was delayed by 40 minutes. You may be entitled to Delay Repay.",
    )
    rows = detection_service.detect_message(message, today)
    assert len(rows) == 1
    assert rows[0].due_date == today - timedelta(days=1) + timedelta(days=28)
    assert rows[0].due_date_estimated is True
    assert "estimated" in rows[0].reason


def test_payment_refund_renewal_detected_and_promo_ignored(inbox) -> None:
    today = date.today()
    rows = detection_service.scan_inbox("user-a").proposals
    kinds = {row.kind.value for row in rows}
    assert kinds == {"delay_repay", "payment_due", "refund_promised", "renewal"}

    bill = [row for row in rows if row.kind.value == "payment_due"][0]
    assert bill.due_date == today + timedelta(days=2)
    assert "£42.50" in bill.title

    refund = [row for row in rows if row.kind.value == "refund_promised"][0]
    assert refund.target.value == "promise"
    assert refund.counterparty == "Amazon UK"
    assert "£18.99" in (refund.promise_text or "")

    renewal = [row for row in rows if row.kind.value == "renewal"][0]
    assert renewal.due_date == today + timedelta(days=10)


def test_scan_endpoint_reports_proposals_and_counts_scanned(inbox) -> None:
    _as("user-a")
    response = client.get("/api/v1/life/detect?limit=20")
    assert response.status_code == 200
    body = response.json()
    assert body["scanned"] == 6
    assert len(body["proposals"]) == 4
    assert {row["status"] for row in body["proposals"]} == {"new"}


def test_scan_fails_closed_when_google_is_not_connected(monkeypatch: pytest.MonkeyPatch) -> None:
    def _boom(user_id: str, limit: int = 20):
        raise ConnectorNotConnectedError("Google is not connected")

    monkeypatch.setattr(detection_service, "recent_gmail", _boom)
    _as("user-a")
    response = client.get("/api/v1/life/detect")
    assert response.status_code == 409


def test_accept_proposal_through_bounded_authority_creates_obligation(inbox) -> None:
    _as("user-a")
    scan = client.get("/api/v1/life/detect").json()
    bill = [row for row in scan["proposals"] if row["kind"] == "payment_due"][0]

    proposed = client.post(
        "/api/v1/authority/actions",
        json={
            "tool": "life.create_obligation",
            "summary": bill["title"],
            "parameters": {
                "title": bill["title"],
                "due_date": bill["due_date"],
                "source": "gmail",
                "notes": bill["notes"],
                "evidence_ids": [bill["evidence_message_id"]],
            },
            "evidence_ids": [bill["evidence_message_id"]],
            "idempotency_key": bill["id"],
        },
    )
    assert proposed.status_code == 200
    action_id = proposed.json()["id"]
    assert proposed.json()["status"] == "proposed"

    confirmed = client.post(f"/api/v1/authority/actions/{action_id}/confirm", json={"confirm": True})
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "executed"
    assert confirmed.json()["result"]["obligation_id"]

    obligations = client.get("/api/v1/life/obligations").json()
    assert len(obligations) == 1
    assert obligations[0]["title"] == bill["title"]
    assert obligations[0]["evidence_ids"] == ["msg-bill"]

    # Due in two days, so the Outcome Loop must surface it.
    outcomes = client.get("/api/v1/outcomes").json()
    assert len(outcomes) == 1
    assert outcomes[0]["kind"] == "obligation"
    assert outcomes[0]["priority"] == "soon"

    # The audit trail records the confirmation.
    audit = client.get("/api/v1/authority/audit").json()
    assert {event["event"] for event in audit} >= {"proposed", "confirmed", "executed"}


def test_accept_is_idempotent_and_recorded_proposals_are_not_reproposed(inbox) -> None:
    _as("user-a")
    scan = client.get("/api/v1/life/detect").json()
    bill = [row for row in scan["proposals"] if row["kind"] == "payment_due"][0]
    payload = {
        "tool": "life.create_obligation",
        "summary": bill["title"],
        "parameters": {
            "title": bill["title"],
            "due_date": bill["due_date"],
            "source": "gmail",
            "evidence_ids": [bill["evidence_message_id"]],
        },
        "evidence_ids": [bill["evidence_message_id"]],
        "idempotency_key": bill["id"],
    }
    first = client.post("/api/v1/authority/actions", json=payload).json()
    second = client.post("/api/v1/authority/actions", json=payload).json()
    assert first["id"] == second["id"]

    client.post(f"/api/v1/authority/actions/{first['id']}/confirm", json={"confirm": True})
    again = client.post(f"/api/v1/authority/actions/{first['id']}/confirm", json={"confirm": True})
    assert again.status_code == 200
    assert again.json()["status"] == "executed"
    assert len(client.get("/api/v1/life/obligations").json()) == 1

    rescan = client.get("/api/v1/life/detect").json()
    same = [row for row in rescan["proposals"] if row["id"] == bill["id"]][0]
    assert same["status"] == "already_recorded"


def test_dismissed_proposals_stay_dismissed(inbox) -> None:
    _as("user-a")
    scan = client.get("/api/v1/life/detect").json()
    renewal = [row for row in scan["proposals"] if row["kind"] == "renewal"][0]
    dismissed = client.post(f"/api/v1/life/detect/{renewal['id']}/dismiss")
    assert dismissed.status_code == 200
    assert dismissed.json() == {"dismissed": True}

    rescan = client.get("/api/v1/life/detect").json()
    same = [row for row in rescan["proposals"] if row["id"] == renewal["id"]][0]
    assert same["status"] == "dismissed"


def test_unknown_tool_is_rejected(inbox) -> None:
    _as("user-a")
    response = client.post(
        "/api/v1/authority/actions",
        json={"tool": "life.delete_everything", "summary": "nope", "parameters": {}},
    )
    assert response.status_code == 400


def test_detection_is_owner_scoped_and_data_survives_restart(inbox) -> None:
    _as("user-a")
    scan = client.get("/api/v1/life/detect").json()
    bill = [row for row in scan["proposals"] if row["kind"] == "payment_due"][0]
    action = client.post(
        "/api/v1/authority/actions",
        json={
            "tool": "life.create_obligation",
            "summary": bill["title"],
            "parameters": {
                "title": bill["title"],
                "due_date": bill["due_date"],
                "source": "gmail",
                "evidence_ids": [bill["evidence_message_id"]],
            },
            "evidence_ids": [bill["evidence_message_id"]],
            "idempotency_key": bill["id"],
        },
    ).json()
    client.post(f"/api/v1/authority/actions/{action['id']}/confirm", json={"confirm": True})

    _as("user-b")
    assert client.get("/api/v1/life/obligations").json() == []
    assert client.get("/api/v1/outcomes").json() == []

    # Simulate a backend restart: drop the in-memory state and reload the
    # JSON store from disk. User A's obligation must still be there.
    _as("user-a")
    life_service._state.clear()
    life_service._load()
    obligations = client.get("/api/v1/life/obligations").json()
    assert len(obligations) == 1
    assert obligations[0]["title"] == bill["title"]
