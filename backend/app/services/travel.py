"""Travel & Transport quotes with signed one-tap confirmation tokens."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import time
import uuid
from datetime import date, datetime, timedelta

from app.config import settings
from app.schemas.travel import TravelHotel, TravelPricing, TravelQuote

_TOKEN_TTL = 15 * 60

_CITIES = {
    "london": "London",
    "لندن": "London",
    "manchester": "Manchester",
    "منچستر": "Manchester",
    "birmingham": "Birmingham",
    "بیرمنگام": "Birmingham",
    "paris": "Paris",
    "پاریس": "Paris",
    "istanbul": "Istanbul",
    "استانبول": "Istanbul",
    "dubai": "Dubai",
    "دبی": "Dubai",
    "tehran": "Tehran",
    "تهران": "Tehran",
    "amsterdam": "Amsterdam",
    "آمستردام": "Amsterdam",
}

_HOTELS = {
    "London": "The Carbon Dock",
    "Manchester": "Deansgate House",
    "Birmingham": "Jewellery Quarter Inn",
    "Paris": "Hôtel du Canal",
    "Istanbul": "Galata Bridge Hotel",
    "Dubai": "Creek View Suites",
    "Tehran": "Valiasr Garden Hotel",
    "Amsterdam": "Canal House",
}

_SERVICE_RE = (
    (re.compile(r"flight|fly|plane|پرواز|هواپیما", re.I), "flight"),
    (re.compile(r"hotel|stay|هتل|اقامت", re.I), "hotel"),
    (re.compile(r"taxi|cab|uber|تاکسی|اسنپ", re.I), "taxi"),
    (re.compile(r"bus|coach|اتوبوس", re.I), "bus"),
    (re.compile(r"train|rail|قطار", re.I), "train"),
)

_PRICES = {
    "flight": (148.0, 4.5),
    "train": (42.0, 2.4),
    "hotel": (18.0, 0.0),
    "taxi": (28.0, 0.6),
    "bus": (19.0, 4.0),
    "unknown": (36.0, 2.0),
}


def _secret() -> bytes:
    return settings.TRAVEL_SIGNING_SECRET.encode()


def _sign(payload: dict[str, object]) -> str:
    blob = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    digest = hmac.new(_secret(), blob, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(blob + b"." + digest).decode()


def verify_confirm_token(token: str, intent_id: str) -> bool:
    try:
        raw = base64.urlsafe_b64decode(token.encode())
        blob, digest = raw.rsplit(b".", 1)
        expected = hmac.new(_secret(), blob, hashlib.sha256).digest()
        if not hmac.compare_digest(digest, expected):
            return False
        payload = json.loads(blob.decode())
        if payload.get("intent_id") != intent_id:
            return False
        return int(payload.get("exp", 0)) >= int(time.time())
    except (ValueError, json.JSONDecodeError, TypeError):
        return False


def _city(query: str) -> str | None:
    lower = query.lower()
    for alias, name in _CITIES.items():
        if alias in lower:
            return name
    return None


def _date(query: str) -> date:
    today = date.today()
    if re.search(r"tomorrow|فردا", query, re.I):
        return today + timedelta(days=1)
    if re.search(r"پس\s*فردا|day after", query, re.I):
        return today + timedelta(days=2)
    if re.search(r"next week|هفته", query, re.I):
        return today + timedelta(days=7)
    match = re.search(r"(20\d{2}-\d{2}-\d{2})", query)
    if match:
        return date.fromisoformat(match.group(1))
    return today + timedelta(days=1)


def _service(query: str) -> str:
    for pattern, name in _SERVICE_RE:
        if pattern.search(query):
            return name
    return "train"


def quote_travel(query: str, locale: str = "en") -> TravelQuote:
    destination = _city(query) or ("تهران" if locale == "fa" else "London")
    service = _service(query)
    travel_date = _date(query)
    nights = 2 if service in {"hotel", "flight"} else 1
    transport, hours = _PRICES.get(service, _PRICES["unknown"])
    stay = 96.0 * nights if service in {"hotel", "flight"} else 0.0
    arrival_dt = datetime.combine(travel_date, datetime.min.time()) + timedelta(hours=10 + hours)
    origin = "Manchester" if destination != "Manchester" else "London"
    hotel = None
    if stay:
        hotel = TravelHotel(
            name=_HOTELS.get(destination, "EchoMind Lodge"),
            nights=nights,
            check_in=travel_date.isoformat(),
        )
    intent_id = uuid.uuid4().hex[:12]
    pricing = TravelPricing(total=round(transport + stay, 2), transport=transport, stay=stay)
    token = _sign(
        {
            "intent_id": intent_id,
            "total": pricing.total,
            "destination": destination,
            "exp": int(time.time()) + _TOKEN_TTL,
        }
    )
    if locale == "fa":
        summary = f"{service} به {destination} در {travel_date.isoformat()}"
    else:
        summary = f"{service.title()} to {destination} on {travel_date.isoformat()}"
    return TravelQuote(
        intent_id=intent_id,
        destination=destination,
        origin=origin,
        date=travel_date.isoformat(),
        service_type=service,  # type: ignore[arg-type]
        hotel=hotel,
        estimated_arrival=arrival_dt.strftime("%Y-%m-%d %H:%M"),
        pricing=pricing,
        summary=summary,
        confirm_token=token,
        status="quoted",
        locale=locale,
    )


def _read_token(token: str) -> dict[str, object]:
    raw = base64.urlsafe_b64decode(token.encode())
    blob, digest = raw.rsplit(b".", 1)
    expected = hmac.new(_secret(), blob, hashlib.sha256).digest()
    if not hmac.compare_digest(digest, expected):
        raise ValueError("Confirmation token is invalid or expired")
    payload = json.loads(blob.decode())
    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("Confirmation token is invalid or expired")
    return payload


def confirm_travel(intent_id: str, token: str, locale: str = "en") -> TravelQuote:
    payload = _read_token(token)
    if payload.get("intent_id") != intent_id:
        raise ValueError("Confirmation token is invalid or expired")
    destination = str(payload.get("destination") or "London")
    total = float(payload.get("total") or 0)
    quoted = quote_travel(f"hotel {destination}", locale)
    return quoted.model_copy(
        update={
            "intent_id": intent_id,
            "destination": destination,
            "status": "confirmed",
            "confirm_token": token,
            "pricing": TravelPricing(
                total=total,
                transport=quoted.pricing.transport,
                stay=max(0.0, round(total - quoted.pricing.transport, 2)),
            ),
            "summary": (
                "سفر تأیید شد"
                if locale == "fa"
                else "Trip confirmed — EchoMind held the signed approval."
            ),
        }
    )
