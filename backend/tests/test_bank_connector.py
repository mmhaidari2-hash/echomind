"""Bank (TrueLayer Open Banking) connector tests: fail-closed when
unconfigured or unconnected, real consent flow with stubbed HTTP, and
— the important one — there is no payment route at all."""

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.auth import require_user
from app.config import settings
from app.main import app

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def _configure(monkeypatch, env: str = "sandbox") -> None:
    monkeypatch.setattr(settings, "TRUELAYER_CLIENT_ID", "tl-client-id")
    monkeypatch.setattr(settings, "TRUELAYER_CLIENT_SECRET", "tl-client-secret")
    monkeypatch.setattr(settings, "TRUELAYER_REDIRECT_URI", "https://example.test/bank/callback")
    monkeypatch.setattr(settings, "TRUELAYER_ENV", env)
    monkeypatch.setattr(settings, "CONNECTOR_TOKEN_KEY", Fernet.generate_key().decode())


def _begin_state(monkeypatch, env: str = "sandbox") -> str:
    _configure(monkeypatch, env)
    started = client.post("/api/v1/connectors/bank/start")
    assert started.status_code == 200
    return started.json()["authorization_url"]


def test_bank_fails_closed_when_not_configured() -> None:
    _as("user-a")
    status = client.get("/api/v1/connectors/bank/status")
    assert status.status_code == 200
    assert status.json() == {
        "configured": False,
        "connected": False,
        "provider": "TrueLayer",
        "environment": "sandbox",
    }

    start = client.post("/api/v1/connectors/bank/start")
    assert start.status_code == 503


def test_bank_reads_fail_closed_without_connection(monkeypatch) -> None:
    _configure(monkeypatch)
    _as("user-a")
    assert client.get("/api/v1/connectors/bank/accounts").status_code == 409
    assert client.get("/api/v1/connectors/bank/accounts/acc-1/transactions").status_code == 409


def test_bank_begin_uses_sandbox_by_default_and_live_when_set(monkeypatch) -> None:
    sandbox_url = _begin_state(monkeypatch, "sandbox")
    assert "auth.truelayer-sandbox.com" in sandbox_url
    assert "client_id=tl-client-id" in sandbox_url
    assert "scope=" in sandbox_url and "transactions" in sandbox_url

    live_url = _begin_state(monkeypatch, "live")
    assert "auth.truelayer.com" in live_url
    assert "sandbox" not in live_url


def test_bank_complete_rejects_bad_state(monkeypatch) -> None:
    _configure(monkeypatch)
    _as("user-a")
    callback = client.get("/api/v1/connectors/bank/callback?state=nope&code=code")
    assert callback.status_code == 403


def test_bank_complete_accounts_and_transactions(monkeypatch) -> None:
    from app.services import truelayer_connector

    url = _begin_state(monkeypatch)
    state = url.split("state=")[1].split("&")[0]

    def fake_post_form(post_url, form):
        assert post_url.endswith("/connect/token")
        assert form["grant_type"] == "authorization_code"
        return {
            "access_token": "tl-access",
            "refresh_token": "tl-refresh",
            "expires_in": 3600,
            "scope": "info accounts balance transactions",
        }

    def fake_get_json(get_url, access_token):
        assert access_token == "tl-access"
        if get_url.endswith("/data/v1/accounts"):
            return {
                "results": [
                    {
                        "account_id": "acc-1",
                        "account_type": "TRANSACTION",
                        "display_name": "Current account",
                        "currency": "GBP",
                        "provider": {"display_name": "Mock Bank"},
                    }
                ]
            }
        if "/balance" in get_url:
            return {"results": [{"current": 1234.56, "available": 1200.0}]}
        if "/transactions" in get_url:
            return {
                "results": [
                    {
                        "transaction_id": "tx-1",
                        "timestamp": "2026-11-25T09:00:00Z",
                        "description": "Tesco",
                        "amount": -42.10,
                        "currency": "GBP",
                        "transaction_category": "SHOPPING",
                    }
                ]
            }
        raise AssertionError(f"unexpected GET {get_url}")

    monkeypatch.setattr(truelayer_connector, "_post_form", fake_post_form)
    monkeypatch.setattr(truelayer_connector, "_get_json", fake_get_json)

    callback = client.get(f"/api/v1/connectors/bank/callback?state={state}&code=auth-code")
    assert callback.status_code == 200
    assert "Bank connected" in callback.text
    assert "cannot move money" in callback.text

    status = client.get("/api/v1/connectors/bank/status")
    assert status.json() == {
        "configured": True,
        "connected": True,
        "provider": "TrueLayer",
        "environment": "sandbox",
    }

    accounts = client.get("/api/v1/connectors/bank/accounts")
    assert accounts.status_code == 200
    assert len(accounts.json()) == 1
    assert accounts.json()[0]["name"] == "Current account"
    assert accounts.json()[0]["currency"] == "GBP"
    assert accounts.json()[0]["balance"] == 1234.56

    transactions = client.get("/api/v1/connectors/bank/accounts/acc-1/transactions")
    assert transactions.status_code == 200
    assert len(transactions.json()) == 1
    assert transactions.json()[0]["description"] == "Tesco"
    assert transactions.json()[0]["amount"] == -42.10

    removed = client.delete("/api/v1/connectors/bank")
    assert removed.json() == {"disconnected": True}
    assert client.get("/api/v1/connectors/bank/status").json()["connected"] is False


def test_bank_has_no_payment_route(monkeypatch) -> None:
    _configure(monkeypatch)
    _as("user-a")
    assert client.post("/api/v1/connectors/bank/payments", json={}).status_code == 404
    assert client.get("/api/v1/connectors/bank/payments").status_code == 404
