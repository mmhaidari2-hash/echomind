"""Renewal Guard tests: decision deadline, cost parsing, totals."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app
from app.schemas.life import ObligationCreate
from app.services.life import add_obligation

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def _renewal(user_id: str, title: str, due: date | None, notes: str = "") -> str:
    item = add_obligation(
        user_id,
        ObligationCreate(title=title, due_date=due, source="gmail", notes=notes),
    )
    return item.id


def test_decision_deadline_is_renewal_minus_seven_days() -> None:
    _as("user-a")
    due = date.today() + timedelta(days=20)
    _renewal("user-a", "Renewal — Car insurance", due, notes="£385.00 per year")
    response = client.get("/api/v1/life/renewals")
    assert response.status_code == 200
    body = response.json()
    assert len(body["renewals"]) == 1
    item = body["renewals"][0]
    assert item["decision_deadline"] == (due - timedelta(days=7)).isoformat()
    assert item["annual_cost_gbp"] == 385.0
    assert body["total_annual_cost_gbp"] == 385.0
    assert item["calendar_blocker"]["tool"] == "calendar.event.create"


def test_monthly_amount_is_annualised() -> None:
    _as("user-a")
    due = date.today() + timedelta(days=30)
    _renewal("user-a", "Renewal — Gym", due, notes="£25 per month")
    body = client.get("/api/v1/life/renewals").json()
    assert body["renewals"][0]["annual_cost_gbp"] == 300.0


def test_thousands_separator_is_not_a_decimal_point() -> None:
    _as("user-a")
    due = date.today() + timedelta(days=30)
    _renewal("user-a", "Renewal — Home insurance", due, notes="£1,200 per year")
    body = client.get("/api/v1/life/renewals").json()
    assert body["renewals"][0]["annual_cost_gbp"] == 1200.0


def test_non_renewal_obligations_are_ignored() -> None:
    _as("user-a")
    _renewal("user-a", "Pay — Council tax", date.today() + timedelta(days=5), notes="£180")
    body = client.get("/api/v1/life/renewals").json()
    assert body["renewals"] == []
    assert body["total_annual_cost_gbp"] == 0.0


def test_renewal_without_a_date_has_no_deadline_or_blocker() -> None:
    _as("user-a")
    _renewal("user-a", "Renewal — Broadband", None, notes="£32 per month")
    body = client.get("/api/v1/life/renewals").json()
    item = body["renewals"][0]
    assert item["decision_deadline"] is None
    assert item["calendar_blocker"] == {}
    assert item["annual_cost_gbp"] == 384.0


def test_renewals_are_owner_scoped() -> None:
    _as("user-a")
    _renewal("user-a", "Renewal — Car insurance", date.today() + timedelta(days=20), notes="£385")
    _as("user-b")
    body = client.get("/api/v1/life/renewals").json()
    assert body["renewals"] == []
