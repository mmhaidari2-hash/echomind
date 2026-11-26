"""Delay Repay Claim Pack tests: deadline math, checklist, obligation."""

from datetime import date, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.delay_repay import DelayRepayClaimRequest, TicketType
from app.services.claim_pack import build_claim_pack

client = TestClient(app)


def _request(**overrides) -> DelayRepayClaimRequest:
    data: dict = {
        "operator": "Avanti West Coast",
        "origin": "Birmingham New Street",
        "destination": "London Euston",
        "journey_date": date(2026, 11, 20),
        "delay_minutes": 45,
        "ticket_type": TicketType.single,
        "ticket_cost": Decimal("42.50"),
        "ticket_reference": "ABC123",
    }
    data.update(overrides)
    return DelayRepayClaimRequest(**data)


def test_filing_deadline_is_journey_plus_28_days() -> None:
    pack = build_claim_pack(_request())
    assert pack.filing_deadline == date(2026, 11, 20) + timedelta(days=28)
    assert pack.filing_deadline_estimated is False
    assert pack.estimate_gbp == Decimal("21.25")
    assert pack.claim_url is not None and "avanti" in pack.claim_url


def test_no_journey_date_means_no_deadline_and_a_warning() -> None:
    pack = build_claim_pack(_request(journey_date=None))
    assert pack.filing_deadline is None
    assert pack.filing_deadline_estimated is True
    assert any("journey date" in step for step in pack.next_steps)


def test_evidence_checklist_names_ticket_reference_and_proof() -> None:
    pack = build_claim_pack(_request(proof_filename="ticket.pdf"), evidence_message_id="m9")
    assert any("ABC123" in line for line in pack.evidence_checklist)
    assert any("ticket.pdf" in line for line in pack.evidence_checklist)
    assert any("m9" in line for line in pack.evidence_checklist)


def test_filing_obligation_carries_deadline_estimate_and_evidence() -> None:
    pack = build_claim_pack(_request(), evidence_message_id="m9")
    obligation = pack.filing_obligation
    assert obligation["title"] == "File Delay Repay — Avanti West Coast"
    assert obligation["due_date"] == "2026-12-18"
    assert "£21.25" in str(obligation["notes"])
    assert obligation["evidence_ids"] == ["m9"]


def test_not_eligible_journey_still_gets_a_pack_with_zero_estimate() -> None:
    pack = build_claim_pack(_request(delay_minutes=5))
    assert pack.eligible is False
    assert pack.estimate_gbp == Decimal("0")
    assert pack.filing_deadline == date(2026, 11, 20) + timedelta(days=28)


def test_pack_endpoint_returns_the_pack() -> None:
    response = client.post(
        "/api/v1/delay-repay/pack?evidence_message_id=m9",
        json={
            "operator": "Avanti West Coast",
            "journey_date": "2026-11-20",
            "delay_minutes": 45,
            "ticket_type": "single",
            "ticket_cost": "42.50",
            "ticket_reference": "ABC123",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["filing_deadline"] == "2026-12-18"
    assert body["estimate_gbp"] == "21.25"
    assert body["filing_obligation"]["evidence_ids"] == ["m9"]
