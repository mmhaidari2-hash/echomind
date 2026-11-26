"""Travel Guard and Calendar Guard tests."""

from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app
from app.schemas.connectors import CalendarEventSummary, GmailMessageSummary
from app.services import calendar_guard as calendar_guard_service
from app.services import travel_guard as travel_guard_service

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def _event(event_id: str, summary: str, start: str, end: str, location: str = "") -> CalendarEventSummary:
    return CalendarEventSummary(id=event_id, summary=summary, start=start, end=end, location=location)


def _msg(message_id: str, subject: str, snippet: str) -> GmailMessageSummary:
    return GmailMessageSummary(id=message_id, subject=subject, sender="airline@example.com", date="2026-11-26", snippet=snippet)


# --- Travel Guard ---

def test_confirmed_when_booking_message_matches_the_trip_day() -> None:
    events = [_event("e1", "Flight to Edinburgh", "2026-12-05T07:30:00Z", "2026-12-05T09:00:00Z", "Heathrow")]
    mail = [_msg("m1", "Your booking confirmation", "Your flight to Edinburgh on 2026-12-05 is booked.")]
    result = travel_guard_service.travel_guard(
        "user-a",
        _calendar=lambda _user, _limit: events,
        _mail=lambda _user, _limit: mail,
    )
    assert len(result.trips) == 1
    assert result.trips[0].status == "confirmed"
    assert result.trips[0].evidence_message_id == "m1"


def test_missing_booking_when_no_message_matches() -> None:
    events = [_event("e1", "Hotel in Edinburgh", "2026-12-05T15:00:00Z", "2026-12-07T11:00:00Z")]
    result = travel_guard_service.travel_guard(
        "user-a",
        _calendar=lambda _user, _limit: events,
        _mail=lambda _user, _limit: [],
    )
    assert result.trips[0].status == "missing_booking"


def test_disruption_beats_confirmation() -> None:
    events = [_event("e1", "Train to London", "2026-12-01T08:00:00Z", "2026-12-01T09:30:00Z")]
    mail = [
        _msg("m1", "Booking confirmation", "Your train ticket is booked for 2026-12-01."),
        _msg("m2", "Service update", "Your train on 2026-12-01 is cancelled due to a disruption."),
    ]
    result = travel_guard_service.travel_guard(
        "user-a",
        _calendar=lambda _user, _limit: events,
        _mail=lambda _user, _limit: mail,
    )
    assert result.trips[0].status == "disruption"
    assert result.trips[0].evidence_message_id == "m2"


def test_non_trip_events_are_not_checked() -> None:
    events = [_event("e1", "Dentist", "2026-12-01T10:00:00Z", "2026-12-01T10:30:00Z")]
    result = travel_guard_service.travel_guard(
        "user-a",
        _calendar=lambda _user, _limit: events,
        _mail=lambda _user, _limit: [],
    )
    assert result.trips == []


# --- Calendar Guard ---

def test_overlap_is_flagged() -> None:
    events = [
        _event("e1", "Meeting", "2026-12-01T10:00:00+00:00", "2026-12-01T11:00:00+00:00"),
        _event("e2", "Call", "2026-12-01T10:30:00+00:00", "2026-12-01T11:30:00+00:00"),
    ]
    result = calendar_guard_service.calendar_guard("user-a", _calendar=lambda _user, _limit: events)
    assert len(result.conflicts) == 1
    assert result.conflicts[0].type == "overlap"
    assert result.conflicts[0].event_ids == ["e1", "e2"]


def test_back_to_back_events_do_not_conflict() -> None:
    events = [
        _event("e1", "Meeting", "2026-12-01T10:00:00+00:00", "2026-12-01T11:00:00+00:00"),
        _event("e2", "Call", "2026-12-01T11:00:00+00:00", "2026-12-01T11:30:00+00:00"),
    ]
    result = calendar_guard_service.calendar_guard("user-a", _calendar=lambda _user, _limit: events)
    assert result.conflicts == []


def test_travel_risk_when_two_places_are_30_minutes_apart() -> None:
    events = [
        _event("e1", "Dentist", "2026-12-01T10:00:00+00:00", "2026-12-01T10:30:00+00:00", "Camden"),
        _event("e2", "Meeting", "2026-12-01T11:00:00+00:00", "2026-12-01T12:00:00+00:00", "Croydon"),
    ]
    result = calendar_guard_service.calendar_guard("user-a", _calendar=lambda _user, _limit: events)
    assert len(result.conflicts) == 1
    assert result.conflicts[0].type == "travel_risk"
    assert "30 minutes" in result.conflicts[0].detail


def test_no_travel_risk_when_the_gap_is_an_hour_or_more() -> None:
    events = [
        _event("e1", "Dentist", "2026-12-01T10:00:00+00:00", "2026-12-01T10:30:00+00:00", "Camden"),
        _event("e2", "Meeting", "2026-12-01T11:30:00+00:00", "2026-12-01T12:00:00+00:00", "Croydon"),
    ]
    result = calendar_guard_service.calendar_guard("user-a", _calendar=lambda _user, _limit: events)
    assert result.conflicts == []


def test_no_travel_risk_when_one_location_is_missing() -> None:
    events = [
        _event("e1", "Dentist", "2026-12-01T10:00:00+00:00", "2026-12-01T10:30:00+00:00", "Camden"),
        _event("e2", "Call", "2026-12-01T11:00:00+00:00", "2026-12-01T11:30:00+00:00"),
    ]
    result = calendar_guard_service.calendar_guard("user-a", _calendar=lambda _user, _limit: events)
    assert result.conflicts == []


def test_all_day_events_are_skipped() -> None:
    events = [
        _event("e1", "Holiday", "2026-12-01", "2026-12-08"),
        _event("e2", "Meeting", "2026-12-01T10:00:00+00:00", "2026-12-01T11:00:00+00:00"),
    ]
    result = calendar_guard_service.calendar_guard("user-a", _calendar=lambda _user, _limit: events)
    assert result.conflicts == []


def test_guards_fail_closed_without_google() -> None:
    _as("user-a")
    assert client.get("/api/v1/travel/guard").status_code in {409, 503}
    assert client.get("/api/v1/calendar/guard").status_code in {409, 503}
