from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def test_memory_is_isolated_between_users() -> None:
    _as("user-a")
    saved = client.put(
        "/api/v1/memory/preferences",
        json={"display_name": "Alice", "locale": "en", "home_station": "Richmond", "tone": "concise"},
    )
    assert saved.status_code == 200

    _as("user-b")
    other = client.get("/api/v1/memory/profile")
    assert other.status_code == 200
    assert other.json()["preferences"]["display_name"] is None
    assert "Richmond" not in other.json()["locations"]

    _as("user-a")
    own = client.get("/api/v1/memory/profile")
    assert own.status_code == 200
    assert own.json()["preferences"]["display_name"] == "Alice"
    assert own.json()["locations"] == ["Richmond"]


def test_conversation_history_is_owner_scoped_and_retrievable() -> None:
    _as("user-a")
    first = client.post(
        "/api/v1/chat",
        json={
            "message": "My train was delayed. Help me with Delay Repay.",
            "conversation_id": "conv-a",
            "locale": "en",
        },
    )
    assert first.status_code == 200

    detail = client.get("/api/v1/conversations/conv-a")
    assert detail.status_code == 200
    assert len(detail.json()["turns"]) == 2

    _as("user-b")
    hidden = client.get("/api/v1/conversations/conv-a")
    assert hidden.status_code == 404


def test_watches_are_isolated_between_users() -> None:
    _as("user-a")
    created = client.post(
        "/api/v1/notifications/watches",
        json={"kind": "purchase", "title": "Laptop", "anchor_date": "2026-11-01", "locale": "en"},
    )
    assert created.status_code == 200

    _as("user-b")
    other = client.get("/api/v1/notifications/watches")
    assert other.status_code == 200
    assert other.json() == []

    _as("user-a")
    own = client.get("/api/v1/notifications/watches")
    assert own.status_code == 200
    assert len(own.json()) == 1
    assert own.json()[0]["title"] == "Laptop"
