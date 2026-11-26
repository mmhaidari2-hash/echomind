"""Morning Brief and Evidence Locker tests."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app
from app.schemas.connectors import GmailMessageSummary
from app.schemas.life import ObligationCreate, PromiseCreate
from app.services import briefing as briefing_service
from app.services import evidence as evidence_service
from app.services.life import add_obligation, add_promise

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def _seed(user_id: str) -> None:
    today = date.today()
    add_obligation(
        user_id,
        ObligationCreate(title="Pay — Council tax", due_date=today - timedelta(days=2), source="user"),
    )
    add_obligation(
        user_id,
        ObligationCreate(title="Renewal — Car insurance", due_date=today, source="gmail", notes="£385"),
    )
    add_obligation(
        user_id,
        ObligationCreate(title="File Delay Repay", due_date=today + timedelta(days=5), source="delay_repay"),
    )
    add_promise(
        user_id,
        PromiseCreate(counterparty="British Gas", promise="Refund of £42.50", due_date=today),
    )


# --- Morning Brief ---

def test_brief_ranks_overdue_first_then_due_today() -> None:
    _as("user-a")
    _seed("user-a")
    brief = briefing_service.today_brief("user-a")
    titles = [item.title for item in brief.items]
    assert titles.index("Pay — Council tax") < titles.index("Renewal — Car insurance")
    assert brief.counts["overdue"] == 1
    assert brief.counts["due_today"] == 1
    assert brief.counts["due_soon"] == 1


def test_brief_is_empty_when_nothing_is_open() -> None:
    _as("user-a")
    brief = briefing_service.today_brief("user-a")
    assert brief.items == []
    assert brief.counts["overdue"] == 0


def test_brief_endpoint_is_owner_scoped_and_bilingual() -> None:
    _as("user-a")
    _seed("user-a")
    response = client.get("/api/v1/brief/today")
    assert response.status_code == 200
    assert response.json()["counts"]["overdue"] == 1

    _as("user-b")
    assert client.get("/api/v1/brief/today").json()["items"] == []

    _as("user-a")
    fa = client.get("/api/v1/brief/today?locale=fa").json()
    reasons = [item["reason"] for item in fa["items"]]
    assert any("عقب‌افتاده" in reason for reason in reasons)


# --- Evidence Locker ---

def test_completeness_score_weights() -> None:
    assert evidence_service.completeness_score(has_evidence=True, has_due_date=True, has_counterparty=True) == 100
    assert evidence_service.completeness_score(has_evidence=False, has_due_date=True, has_counterparty=True) == 60
    assert evidence_service.completeness_score(has_evidence=False, has_due_date=False, has_counterparty=False) == 0


def test_pack_scores_each_record_and_marks_unavailable_evidence() -> None:
    _as("user-a")
    today = date.today()
    add_obligation(
        "user-a",
        ObligationCreate(
            title="Delay Repay — Avanti",
            due_date=today + timedelta(days=5),
            source="gmail",
            evidence_ids=["m1"],
        ),
    )
    add_promise(
        "user-a",
        PromiseCreate(counterparty="British Gas", promise="Refund", due_date=None),
    )
    pack = evidence_service.evidence_pack("user-a")
    assert pack.total == 2
    by_kind = {item.kind: item for item in pack.items}
    assert by_kind["obligation"].completeness == 100
    assert by_kind["obligation"].evidence[0].available is False  # no Google in the harness
    assert by_kind["promise"].completeness == 30  # counterparty only
    assert pack.complete == 1


def test_pack_fetches_evidence_details_when_google_answers() -> None:
    _as("user-a")
    add_obligation(
        "user-a",
        ObligationCreate(
            title="Delay Repay — Avanti",
            due_date=date.today() + timedelta(days=5),
            source="gmail",
            evidence_ids=["m1"],
        ),
    )
    fake = lambda _user, _message_id: GmailMessageSummary(
        id="m1", subject="Your claim", sender="Avanti <claims@avantiwestcoast.co.uk>", date="2026-11-26", snippet="Approved"
    )
    pack = evidence_service.evidence_pack("user-a", _summary=fake)
    assert pack.items[0].evidence[0].available is True
    assert pack.items[0].evidence[0].subject == "Your claim"


def test_evidence_pack_endpoint_is_owner_scoped() -> None:
    _as("user-a")
    _seed("user-a")
    assert client.get("/api/v1/life/evidence-pack").json()["total"] == 4
    _as("user-b")
    assert client.get("/api/v1/life/evidence-pack").json()["total"] == 0
