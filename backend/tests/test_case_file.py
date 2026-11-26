"""Consumer Rights Case File tests: node, deadlines, obligations."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def _request(**overrides) -> dict:
    data = {
        "retailer_name": "Currys",
        "item_description": "Faulty washing machine",
        "purchase_kind": "goods",
        "purchase_date": "2026-11-10",
        "delivery_date": "2026-11-12",
        "purchase_price": "449.99",
        "fault_description": "Drum stops mid-cycle and leaks water.",
    }
    data.update(overrides)
    return data


def test_case_file_within_30_days_has_both_deadlines() -> None:
    _as("user-a")
    response = client.post("/api/v1/consumer-rights/cases", json=_request())
    assert response.status_code == 200
    body = response.json()
    assert body["case_node"]["kind"] == "case"
    assert body["case_node"]["label"] == "Case — Faulty washing machine"
    assert body["pathway"] == "short_term_reject"
    assert len(body["deadlines"]) == 2
    kinds = {item["kind"]: item["date"] for item in body["deadlines"]}
    assert kinds["reject_window"] == "2026-12-12"
    assert kinds["burden_shift"] == "2027-05-11"
    titles = [item["title"] for item in body["obligations"]]
    assert any("Reject faulty item" in title for title in titles)
    assert any("Gather proof" in title for title in titles)
    assert body["notice_draft"]
    assert body["statute_refs"]


def test_case_file_after_30_days_has_only_the_burden_deadline() -> None:
    _as("user-a")
    response = client.post(
        "/api/v1/consumer-rights/cases",
        json=_request(purchase_date="2026-09-01", delivery_date="2026-09-02"),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["pathway"] in {"repair_or_replace", "burden_shift_guidance"}
    assert [item["kind"] for item in body["deadlines"]] == ["burden_shift"]
    assert len(body["obligations"]) == 1


def test_case_node_and_obligations_land_in_the_life_graph() -> None:
    _as("user-a")
    response = client.post("/api/v1/consumer-rights/cases", json=_request())
    case_id = response.json()["case_node"]["id"]
    snapshot = client.get("/api/v1/life/snapshot").json()
    node_ids = [node["id"] for node in snapshot["nodes"]]
    assert case_id in node_ids
    assert any(item["source"] == "consumer_rights" for item in snapshot["obligations"])


def test_case_file_is_owner_scoped() -> None:
    _as("user-a")
    case_id = client.post("/api/v1/consumer-rights/cases", json=_request()).json()["case_node"]["id"]
    _as("user-b")
    snapshot = client.get("/api/v1/life/snapshot").json()
    assert case_id not in [node["id"] for node in snapshot["nodes"]]
    assert not any(item["source"] == "consumer_rights" for item in snapshot["obligations"])
