"""Outcome Verifier tests: signals, recency, persistence, isolation."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app
from app.schemas.connectors import GmailMessageSummary
from app.schemas.life import ObligationCreate, PromiseCreate
from app.services import verification as verification_service
from app.services.life import add_obligation, add_promise

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def _msg(message_id: str, subject: str, snippet: str, sender: str) -> GmailMessageSummary:
    return GmailMessageSummary(
        id=message_id, subject=subject, sender=sender, date="2026-11-26", snippet=snippet
    )


def _obligation(user_id: str, title: str) -> str:
    item = add_obligation(
        user_id,
        ObligationCreate(
            title=title,
            due_date=date.today() + timedelta(days=5),
            source="gmail",
            notes="Delay Repay claim for the 07:42 to London",
        ),
    )
    return item.id


def test_verified_when_claim_approved_message_arrives() -> None:
    _as("user-a")
    obligation_id = _obligation("user-a", "Delay Repay — Avanti West Coast")
    mail = [
        _msg("m1", "Your claim", "Your claim has been approved. Compensation paid.", "Avanti <claims@avantiwestcoast.co.uk>"),
    ]
    result = verification_service.verify_outcome(
        "user-a", "obligation", obligation_id, _mail=lambda _user, _limit: mail
    )
    assert result.status == "verified"
    assert result.evidence_message_id == "m1"
    assert result.matched_text == "compensation paid"


def test_failed_when_claim_rejected_message_arrives() -> None:
    _as("user-a")
    obligation_id = _obligation("user-a", "Delay Repay — Avanti West Coast")
    mail = [
        _msg("m2", "Your claim", "We are sorry, your claim was rejected.", "Avanti <claims@avantiwestcoast.co.uk>"),
    ]
    result = verification_service.verify_outcome(
        "user-a", "obligation", obligation_id, _mail=lambda _user, _limit: mail
    )
    assert result.status == "failed"
    assert result.evidence_message_id == "m2"


def test_awaiting_when_no_matching_message() -> None:
    _as("user-a")
    obligation_id = _obligation("user-a", "Delay Repay — Avanti West Coast")
    mail = [_msg("m3", "Newsletter", "Your weekly update", "news@example.com")]
    result = verification_service.verify_outcome(
        "user-a", "obligation", obligation_id, _mail=lambda _user, _limit: mail
    )
    assert result.status == "awaiting"
    assert result.evidence_message_id is None


def test_unrelated_rejection_does_not_mark_promise_broken() -> None:
    _as("user-a")
    item = add_promise(
        "user-a",
        PromiseCreate(counterparty="British Gas", promise="Refund of £42.50", due_date=date.today()),
    )
    mail = [
        _msg("m4", "Loan application", "Your loan application was rejected.", "Bank <loans@bank.co.uk>"),
    ]
    result = verification_service.verify_outcome(
        "user-a", "promise", item.id, _mail=lambda _user, _limit: mail
    )
    assert result.status == "awaiting"


def test_refund_verified_only_when_money_arrived() -> None:
    _as("user-a")
    item = add_promise(
        "user-a",
        PromiseCreate(counterparty="Amazon UK", promise="Refund of £18.99", due_date=date.today()),
    )
    mail = [_msg("m5", "Refund", "Your refund is on its way.", "Amazon <no-reply@amazon.co.uk>")]
    result = verification_service.verify_outcome(
        "user-a", "promise", item.id, _mail=lambda _user, _limit: mail
    )
    assert result.status == "awaiting"
    mail = [_msg("m6", "Refund", "Your refund has been paid to your card.", "Amazon <no-reply@amazon.co.uk>")]
    result = verification_service.verify_outcome(
        "user-a", "promise", item.id, _mail=lambda _user, _limit: mail
    )
    assert result.status == "verified"


def test_verification_persists_and_is_owner_scoped() -> None:
    _as("user-a")
    obligation_id = _obligation("user-a", "Delay Repay — Avanti West Coast")
    mail = [_msg("m7", "Claim", "Compensation paid to your account.", "Avanti <claims@avantiwestcoast.co.uk>")]
    verification_service.verify_outcome(
        "user-a", "obligation", obligation_id, _mail=lambda _user, _limit: mail
    )
    response = client.get(f"/api/v1/outcomes/{obligation_id}/verification")
    assert response.status_code == 200
    assert response.json()["status"] == "verified"

    _as("user-b")
    assert client.get(f"/api/v1/outcomes/{obligation_id}/verification").status_code == 404


def test_verify_unknown_record_is_404() -> None:
    _as("user-a")
    response = client.post(
        "/api/v1/outcomes/verify", json={"kind": "obligation", "source_id": "nope"}
    )
    assert response.status_code == 404


def test_verify_without_google_is_409() -> None:
    _as("user-a")
    obligation_id = _obligation("user-a", "Pay — Council tax")
    response = client.post(
        "/api/v1/outcomes/verify", json={"kind": "obligation", "source_id": obligation_id}
    )
    # No Google connection is configured for the test user in this harness.
    assert response.status_code in {409, 503}
