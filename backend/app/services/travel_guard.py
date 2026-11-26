"""Travel Guard: is every upcoming trip actually booked?

A calendar event that says "Flight to Edinburgh" is only a plan. The
guard cross-checks each trip-like event against the recent Gmail:
a booking/confirmation/itinerary message for the same day (or naming the
same place) confirms it; a delay/cancellation message for it flags a
disruption; no message at all means the booking is missing — the thing
that ruins trips. Deterministic keyword matching, no LLM, newest message
wins when a disruption and a confirmation both exist.
"""

from __future__ import annotations

from app.schemas.connectors import CalendarEventSummary, GmailMessageSummary
from app.schemas.travel_guard import TravelGuardResponse, TripCheck
from app.services import google_connector as connector

_TRIP_WORDS = (
    "flight", "train", "hotel", "airport", "station", "holiday",
    "trip", "booking", "check-in", "check in", "departure", "arrival",
    "ferry", "coach",
)
_CONFIRM_WORDS = ("booking", "confirmation", "itinerary", "ticket", "booked", "reserved")
_DISRUPTION_WORDS = ("cancelled", "canceled", "delayed", "delay", "disruption", "rescheduled")


def _is_trip(event: CalendarEventSummary) -> bool:
    text = f"{event.summary} {event.location}".lower()
    return any(word in text for word in _TRIP_WORDS)


def _event_day(event: CalendarEventSummary) -> str:
    return (event.start or "")[:10]


def _place_tokens(event: CalendarEventSummary) -> list[str]:
    tokens = []
    for part in f"{event.summary} {event.location}".lower().replace(",", " ").split():
        if len(part) >= 4 and part not in _TRIP_WORDS:
            tokens.append(part)
    return tokens[:4]


def _message_text(message: GmailMessageSummary) -> str:
    return f"{message.subject} {message.snippet} {message.sender}".lower()


def travel_guard(
    user_id: str,
    *,
    _calendar=None,
    _mail=None,
) -> TravelGuardResponse:
    calendar = _calendar if _calendar is not None else connector.upcoming_calendar
    mail = _mail if _mail is not None else connector.recent_gmail
    events = calendar(user_id, 20)
    messages = mail(user_id, 20)
    trips: list[TripCheck] = []
    for event in events:
        if not _is_trip(event):
            continue
        day = _event_day(event)
        tokens = _place_tokens(event)
        disruption: GmailMessageSummary | None = None
        confirmation: GmailMessageSummary | None = None
        for message in messages:
            text = _message_text(message)
            same_day = bool(day) and day in text
            same_place = any(token in text for token in tokens)
            if not (same_day or same_place):
                continue
            if any(word in text for word in _DISRUPTION_WORDS) and disruption is None:
                disruption = message
            if any(word in text for word in _CONFIRM_WORDS) and confirmation is None:
                confirmation = message
        if disruption is not None:
            trips.append(
                TripCheck(
                    event_id=event.id,
                    summary=event.summary,
                    start=event.start,
                    status="disruption",
                    evidence_message_id=disruption.id,
                    detail="A disruption message arrived for this trip. Check it before you travel.",
                )
            )
        elif confirmation is not None:
            trips.append(
                TripCheck(
                    event_id=event.id,
                    summary=event.summary,
                    start=event.start,
                    status="confirmed",
                    evidence_message_id=confirmation.id,
                    detail="Booking confirmation found in your inbox.",
                )
            )
        else:
            trips.append(
                TripCheck(
                    event_id=event.id,
                    summary=event.summary,
                    start=event.start,
                    status="missing_booking",
                    evidence_message_id=None,
                    detail="No booking confirmation found for this trip. Check that it is actually booked.",
                )
            )
    return TravelGuardResponse(trips=trips, checked_events=len(events))
