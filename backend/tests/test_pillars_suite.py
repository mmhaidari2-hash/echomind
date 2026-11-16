"""Production regression suite for every EchoMind pillar."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

TICKET_TEXT = """
Avanti West Coast
Manchester Piccadilly to London Euston
20/08/2026
Single £24.50
Delayed 45 minutes
Ticket ref AWC123456
"""

RECEIPT_TEXT = """
Argos
Item: kettle
25 Aug 2026
Total £29.99
"""


def test_health_and_root() -> None:
    root = client.get("/")
    assert root.status_code == 200
    assert root.json()["status"] == "online"
    health = client.get("/api/v1/health")
    assert health.status_code == 200
    assert health.json() == {"status": "healthy"}
    ready = client.get("/api/v1/ready")
    assert ready.status_code == 200
    assert ready.json()["gemini"]["status"] in {"ready", "unconfigured"}


def test_delay_repay_45_minute_single() -> None:
    response = client.post(
        "/api/v1/delay-repay/claims",
        json={
            "operator": "avanti",
            "origin": "Manchester Piccadilly",
            "destination": "London Euston",
            "journey_date": "2026-08-20",
            "delay_minutes": 45,
            "ticket_type": "single",
            "ticket_cost": "24.50",
            "locale": "en",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["eligible"] is True
    assert body["tier"] == "30_59"
    assert body["percent"] == 50
    assert Decimal(str(body["estimate_gbp"])) == Decimal("12.25")
    assert "Avanti" in body["operator_name"]
    assert body["claim_draft"]


def test_consumer_rights_short_term_reject() -> None:
    purchase = (date.today() - timedelta(days=10)).isoformat()
    response = client.post(
        "/api/v1/consumer-rights/notices",
        json={
            "retailer_name": "Argos",
            "item_description": "kettle",
            "purchase_date": purchase,
            "purchase_price": "29.99",
            "fault_description": "The kettle stopped boiling after two uses.",
            "prior_remedy": "none",
            "locale": "en",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["pathway"] == "short_term_reject"
    assert body["within_30_days"] is True
    assert body["recommended_remedy"] == "refund"
    assert "Consumer Rights Act" in body["notice_draft"] or "2015" in body["guideline"]


def test_overdraft_shield_fos_referral() -> None:
    response = client.post(
        "/api/v1/overdraft-shield/notices",
        json={
            "bank_name": "NatWest",
            "fee_amount": "15.00",
            "fee_date": "2026-08-01",
            "fee_description": "Unarranged overdraft fee after a card payment.",
            "prior_complaint": "bank_refused",
            "overdraft_kind": "unarranged",
            "locale": "en",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["pathway"] == "fos_referral"
    assert body["can_refer_fos"] is True
    assert "ombudsman" in body["notice_draft"].lower() or "FOS" in body["guideline"]


def test_ocr_parses_ticket_and_receipt() -> None:
    ticket = client.post(
        "/api/v1/documents/parse-text",
        json={"text": TICKET_TEXT, "filename": "ticket.txt", "locale": "en"},
    )
    assert ticket.status_code == 200
    ticket_body = ticket.json()
    assert ticket_body["kind"] == "train_ticket"
    assert ticket_body["suggested_pillar"] == "delay_repay"
    assert ticket_body["entities"]["operator_id"] == "avanti"
    assert ticket_body["delay_repay"]["delay_minutes"] == 45
    assert Decimal(str(ticket_body["delay_repay"]["ticket_cost"])) == Decimal("24.50")

    upload = client.post(
        "/api/v1/documents/parse",
        files={"file": ("receipt.txt", RECEIPT_TEXT.encode("utf-8"), "text/plain")},
        data={"locale": "en"},
    )
    assert upload.status_code == 200
    receipt = upload.json()
    assert receipt["kind"] == "receipt"
    assert receipt["suggested_pillar"] == "consumer_rights"
    assert receipt["consumer_rights"]["retailer_name"] == "Argos"
    assert Decimal(str(receipt["consumer_rights"]["purchase_price"])) == Decimal("29.99")


def test_smart_alerts_30_day_and_low_balance() -> None:
    purchase = (date.today() - timedelta(days=25)).isoformat()
    response = client.post(
        "/api/v1/notifications/evaluate",
        json={
            "locale": "en",
            "balance": "12",
            "balance_threshold": "50",
            "watches": [
                {
                    "kind": "purchase",
                    "title": "Argos kettle",
                    "anchor_date": purchase,
                    "amount": "29.99",
                    "locale": "en",
                }
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    kinds = {alert["kind"] for alert in body["alerts"]}
    titles = {alert["title"] for alert in body["alerts"]}
    assert "purchase" in kinds
    assert "balance" in kinds
    assert any("30-day" in title for title in titles)
    reject = next(alert for alert in body["alerts"] if alert["kind"] == "purchase")
    assert reject["days_remaining"] == 5
    assert reject["action_pillar"] == "consumer_rights"
    low = next(alert for alert in body["alerts"] if alert["kind"] == "balance")
    assert low["action_pillar"] == "overdraft_shield"


def test_memory_engine_prompt_injection_and_secrets() -> None:
    prefs = client.put(
        "/api/v1/memory/preferences",
        json={
            "display_name": "Mehdi",
            "locale": "en",
            "home_station": "Manchester Piccadilly",
            "preferred_operator": "avanti",
            "tone": "concise",
        },
    )
    assert prefs.status_code == 200
    assert prefs.json()["home_station"] == "Manchester Piccadilly"

    fact = client.post(
        "/api/v1/memory/facts",
        json={"key": "commute", "value": "weekday Avanti to Euston", "source": "preference"},
    )
    assert fact.status_code == 200

    refused = client.post(
        "/api/v1/memory/facts",
        json={"key": "api_key", "value": "should-not-store", "source": "chat"},
    )
    assert refused.status_code == 400

    context = client.get("/api/v1/memory/context", params={"query": "train delay claim"})
    assert context.status_code == 200
    body = context.json()
    assert "Manchester Piccadilly" in body["locations"]
    assert body["prompt_chars"] > 80

    from app.services.memory_engine import build_personalized_prompt

    prompt = build_personalized_prompt("test-user", "Can I claim Delay Repay?", "en")
    assert "Manchester Piccadilly" in prompt
    assert "avanti" in prompt
    assert "Gemini Flash" in prompt


def test_memory_multi_turn_keeps_delay_repay_pillar() -> None:
    first = client.post(
        "/api/v1/chat",
        json={
            "message": "My train was delayed 45 minutes. Can I claim Delay Repay?",
            "conversation_id": "prod-suite-1",
            "locale": "en",
        },
    )
    assert first.status_code == 200
    assert first.json()["pillar"] == "delay_repay"
    assert first.json()["metadata"]["memory_injected"] is True

    follow = client.post(
        "/api/v1/chat",
        json={
            "message": "What should I do next?",
            "conversation_id": "prod-suite-1",
            "locale": "en",
        },
    )
    assert follow.status_code == 200
    assert follow.json()["pillar"] == "delay_repay"


def test_production_cors_rejects_wildcard() -> None:
    from app.config import Settings

    settings = Settings(ENVIRONMENT="production", CORS_ORIGINS="https://app.example")
    assert settings.cors_origin_list() == ["https://app.example"]
    try:
        Settings(ENVIRONMENT="production", CORS_ORIGINS="*").cors_origin_list()
    except ValueError as exc:
        assert "Wildcard" in str(exc)
    else:
        raise AssertionError("production wildcard CORS must be rejected")
