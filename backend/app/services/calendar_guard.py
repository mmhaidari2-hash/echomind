"""Calendar Guard: overlaps and impossible travel between events.

Two checks, both deterministic:
- overlap: two timed events on the same day whose times intersect;
- travel risk: two timed events in different non-empty locations with
  less than 60 minutes between them.

All-day events (date-only start/end) are skipped for the time checks:
they do not have a time to conflict with.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from app.schemas.connectors import CalendarEventSummary
from app.schemas.travel_guard import CalendarConflict, CalendarGuardResponse
from app.services import google_connector as connector

_MIN_TRAVEL_GAP = timedelta(minutes=60)


def _parse(value: str) -> datetime | None:
    if not value or "T" not in value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _timed(event: CalendarEventSummary) -> tuple[datetime, datetime] | None:
    start = _parse(event.start)
    end = _parse(event.end)
    if start is None or end is None:
        return None
    return start, end


def calendar_guard(user_id: str, *, _calendar=None) -> CalendarGuardResponse:
    calendar = _calendar if _calendar is not None else connector.upcoming_calendar
    events = calendar(user_id, 20)
    timed = [(event, _timed(event)) for event in events]
    timed = [(event, span) for event, span in timed if span is not None]
    timed.sort(key=lambda row: row[1][0])
    conflicts: list[CalendarConflict] = []
    for index in range(len(timed)):
        event_a, (start_a, end_a) = timed[index]
        for other in range(index + 1, len(timed)):
            event_b, (start_b, end_b) = timed[other]
            if start_b.date() != start_a.date():
                continue
            if start_b < end_a and start_a < end_b:
                conflicts.append(
                    CalendarConflict(
                        type="overlap",
                        event_ids=[event_a.id, event_b.id],
                        titles=[event_a.summary, event_b.summary],
                        detail=f"'{event_a.summary}' overlaps '{event_b.summary}' on {start_a.date().isoformat()}.",
                    )
                )
                continue
            gap = start_b - end_a
            if timedelta(0) <= gap < _MIN_TRAVEL_GAP:
                place_a = (event_a.location or "").strip()
                place_b = (event_b.location or "").strip()
                if place_a and place_b and place_a.lower() != place_b.lower():
                    conflicts.append(
                        CalendarConflict(
                            type="travel_risk",
                            event_ids=[event_a.id, event_b.id],
                            titles=[event_a.summary, event_b.summary],
                            detail=(
                                f"Only {int(gap.total_seconds() // 60)} minutes between "
                                f"'{event_a.summary}' ({place_a}) and '{event_b.summary}' ({place_b})."
                            ),
                        )
                    )
    return CalendarGuardResponse(conflicts=conflicts, checked_events=len(events))
