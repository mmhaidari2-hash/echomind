from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def test_life_graph_is_private_and_relations_require_owned_nodes() -> None:
    _as("user-a")
    person = client.post("/api/v1/life/nodes", json={"kind": "person", "label": "Alex"}).json()
    company = client.post("/api/v1/life/nodes", json={"kind": "organisation", "label": "Retailer"}).json()
    edge = client.post(
        "/api/v1/life/edges",
        json={"source_id": person["id"], "target_id": company["id"], "relation": "contact_at"},
    )
    assert edge.status_code == 200

    _as("user-b")
    assert client.get("/api/v1/life/snapshot").json()["nodes"] == []
    foreign_edge = client.post(
        "/api/v1/life/edges",
        json={"source_id": person["id"], "target_id": company["id"], "relation": "contact_at"},
    )
    assert foreign_edge.status_code == 404


def test_obligation_engine_marks_due_soon_and_overdue() -> None:
    _as("user-a")
    soon = client.post(
        "/api/v1/life/obligations",
        json={"title": "Submit claim", "due_date": (date.today() + timedelta(days=3)).isoformat()},
    )
    assert soon.status_code == 200
    assert soon.json()["status"] == "due_soon"

    late = client.post(
        "/api/v1/life/obligations",
        json={"title": "Chase refund", "due_date": (date.today() - timedelta(days=1)).isoformat()},
    )
    assert late.status_code == 200
    assert late.json()["status"] == "overdue"

    rows = client.get("/api/v1/life/obligations").json()
    assert [row["status"] for row in rows] == ["overdue", "due_soon"]


def test_promise_tracker_keeps_evidence_and_resolution() -> None:
    _as("user-a")
    promised = client.post(
        "/api/v1/life/promises",
        json={
            "counterparty": "Retailer",
            "promise": "Refund within 5 working days",
            "due_date": (date.today() + timedelta(days=5)).isoformat(),
            "evidence_ids": ["evidence-1"],
        },
    )
    assert promised.status_code == 200
    promise_id = promised.json()["id"]
    assert promised.json()["evidence_ids"] == ["evidence-1"]

    kept = client.post(f"/api/v1/life/promises/{promise_id}/status?status=kept")
    assert kept.status_code == 200
    assert kept.json()["status"] == "kept"
    assert kept.json()["resolved_at"] is not None

    assert client.get("/api/v1/life/promises").json() == []
    closed = client.get("/api/v1/life/promises?include_closed=true").json()
    assert closed[0]["status"] == "kept"
