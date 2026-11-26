"""Provider registry tests: built-in slots, empty slots, encrypted
keys that never leak, fail-closed activation and testing, owner
scoping."""

import json
from urllib.error import HTTPError

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.auth import require_user
from app.config import settings
from app.main import app
from app.services import providers as providers_service

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def _configure_key(monkeypatch) -> None:
    monkeypatch.setattr(settings, "CONNECTOR_TOKEN_KEY", Fernet.generate_key().decode())


class _FakeResponse:
    def __init__(self, payload: bytes = b'{"data": []}'):
        self._payload = payload

    def read(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def _list(user_id: str = "user-a") -> list[dict]:
    _as(user_id)
    response = client.get("/api/v1/providers")
    assert response.status_code == 200
    return response.json()


def test_list_has_builtins_and_three_empty_slots() -> None:
    slots = _list()
    assert len(slots) == 6
    by_id = {slot["id"]: slot for slot in slots}
    assert by_id["gpt"]["name"] == "GPT (ChatGPT)"
    assert by_id["gpt"]["model"] == "gpt-4o"
    assert by_id["gpt"]["endpoint"] == "https://api.openai.com/v1"
    assert by_id["gpt"]["builtin"] is True
    assert by_id["claude"]["endpoint"] == "https://api.anthropic.com/v1"
    assert by_id["cursor"]["builtin"] is True
    assert by_id["cursor"]["endpoint"] == ""
    empties = [slot for slot in slots if not slot["builtin"] and not slot["name"]]
    assert len(empties) == 3
    assert all(slot["has_key"] is False for slot in slots)
    assert "api_key" not in json.dumps(slots)


def test_set_key_activate_and_active(monkeypatch) -> None:
    _configure_key(monkeypatch)
    _as("user-a")
    updated = client.patch("/api/v1/providers/gpt", json={"api_key": "sk-test-gpt"})
    assert updated.status_code == 200
    assert updated.json()["has_key"] is True
    assert "api_key" not in updated.text
    assert "sk-test-gpt" not in updated.text
    active = client.post("/api/v1/providers/gpt/activate")
    assert active.status_code == 200
    assert active.json()["is_active"] is True
    current = client.get("/api/v1/providers/active")
    assert current.json()["id"] == "gpt"


def test_activate_without_key_is_refused(monkeypatch) -> None:
    _configure_key(monkeypatch)
    _as("user-a")
    response = client.post("/api/v1/providers/claude/activate")
    assert response.status_code == 409
    assert "needs an API key" in response.json()["detail"]


def test_activate_without_endpoint_is_refused(monkeypatch) -> None:
    _configure_key(monkeypatch)
    _as("user-a")
    client.patch("/api/v1/providers/cursor", json={"api_key": "cur-test"})
    response = client.post("/api/v1/providers/cursor/activate")
    assert response.status_code == 409
    assert "needs an endpoint" in response.json()["detail"]


def test_test_without_key_is_refused() -> None:
    _as("user-a")
    response = client.post("/api/v1/providers/gpt/test")
    assert response.status_code == 409
    assert "needs an API key" in response.json()["detail"]


def test_test_reports_live_result(monkeypatch) -> None:
    _configure_key(monkeypatch)
    _as("user-a")
    client.patch("/api/v1/providers/gpt", json={"api_key": "sk-test-gpt"})

    def ok_opener(request, timeout=None):
        assert request.full_url == "https://api.openai.com/v1/models"
        assert request.headers.get("Authorization") == "Bearer sk-test-gpt"
        return _FakeResponse()

    monkeypatch.setattr(providers_service, "urlopen", ok_opener)
    result = client.post("/api/v1/providers/gpt/test")
    assert result.status_code == 200
    assert result.json() == {"ok": True, "status": 200, "detail": "The key and endpoint work."}

    def bad_opener(request, timeout=None):
        raise HTTPError(request.full_url, 401, "Unauthorized", {}, None)

    monkeypatch.setattr(providers_service, "urlopen", bad_opener)
    result = client.post("/api/v1/providers/gpt/test")
    assert result.status_code == 200
    assert result.json()["ok"] is False
    assert result.json()["status"] == 401


def test_claude_test_uses_anthropic_headers(monkeypatch) -> None:
    _configure_key(monkeypatch)
    _as("user-a")
    client.patch("/api/v1/providers/claude", json={"api_key": "sk-ant-test"})

    def opener(request, timeout=None):
        assert request.full_url == "https://api.anthropic.com/v1/models"
        assert request.headers.get("X-api-key") == "sk-ant-test"
        assert request.headers.get("Anthropic-version") == "2023-06-01"
        return _FakeResponse()

    monkeypatch.setattr(providers_service, "urlopen", opener)
    result = client.post("/api/v1/providers/claude/test")
    assert result.json()["ok"] is True


def test_custom_slot_crud_and_builtin_delete_refused(monkeypatch) -> None:
    _configure_key(monkeypatch)
    _as("user-a")
    created = client.post(
        "/api/v1/providers",
        json={"name": "My Model", "provider": "custom", "model": "m1", "endpoint": "https://example.test/v1"},
    )
    assert created.status_code == 200
    slot_id = created.json()["id"]
    assert len(_list()) == 7
    updated = client.patch(f"/api/v1/providers/{slot_id}", json={"model": "m2"})
    assert updated.json()["model"] == "m2"
    assert client.delete("/api/v1/providers/gpt").status_code == 400
    deleted = client.delete(f"/api/v1/providers/{slot_id}")
    assert deleted.json() == {"deleted": True}
    assert len(_list()) == 6


def test_clear_key_unsets_and_deactivates(monkeypatch) -> None:
    _configure_key(monkeypatch)
    _as("user-a")
    client.patch("/api/v1/providers/gpt", json={"api_key": "sk-test-gpt"})
    client.post("/api/v1/providers/gpt/activate")
    cleared = client.patch("/api/v1/providers/gpt", json={"clear_key": True})
    assert cleared.json()["has_key"] is False
    assert cleared.json()["is_active"] is False
    assert client.get("/api/v1/providers/active").json() is None


def test_keys_are_owner_scoped(monkeypatch) -> None:
    _configure_key(monkeypatch)
    _as("user-a")
    client.patch("/api/v1/providers/gpt", json={"api_key": "sk-test-gpt"})
    slots_b = _list("user-b")
    by_id = {slot["id"]: slot for slot in slots_b}
    assert by_id["gpt"]["has_key"] is False
    assert len(slots_b) == 6


def test_unknown_slot_is_404() -> None:
    _as("user-a")
    assert client.post("/api/v1/providers/nope/activate").status_code == 404
    assert client.post("/api/v1/providers/nope/test").status_code == 404
    assert client.delete("/api/v1/providers/nope").status_code == 404
