from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_travel_intent_quote_and_confirm() -> None:
    quote = client.post(
        "/api/v1/travel/intent",
        json={"query": "Book me a hotel in Paris tomorrow", "locale": "en"},
    )
    assert quote.status_code == 200
    body = quote.json()
    assert body["destination"] == "Paris"
    assert body["service_type"] == "hotel"
    assert body["hotel"]["name"]
    assert body["pricing"]["total"] > 0
    assert body["confirm_token"]
    assert body["status"] == "quoted"

    denied = client.post(
        "/api/v1/travel/intent",
        json={
            "action": "confirm",
            "intent_id": body["intent_id"],
            "confirm_token": "not-a-real-token",
        },
    )
    assert denied.status_code == 403

    confirmed = client.post(
        "/api/v1/travel/intent",
        json={
            "action": "confirm",
            "intent_id": body["intent_id"],
            "confirm_token": body["confirm_token"],
            "locale": "en",
        },
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "confirmed"
    assert confirmed.json()["intent_id"] == body["intent_id"]


def test_travel_intent_persian_query() -> None:
    response = client.post(
        "/api/v1/travel/intent",
        json={"query": "برای فردا بلیط پرواز به استانبول بگیر", "locale": "fa"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["destination"] == "Istanbul"
    assert body["service_type"] == "flight"
