"""Schemas for Travel Guard and Calendar Guard.

Travel Guard cross-checks the calendar against the inbox: every upcoming
trip-like event is either confirmed by a booking message, missing its
booking, or flagged because a disruption message arrived for it.

Calendar Guard checks the same calendar for internal conflicts: two
events that overlap, or two events in different places with too little
time to travel between them.
"""

from datetime import date

from pydantic import BaseModel, Field


class TripCheck(BaseModel):
    event_id: str
    summary: str
    start: str
    status: str = Field(pattern="^(confirmed|missing_booking|disruption)$")
    evidence_message_id: str | None = None
    detail: str


class TravelGuardResponse(BaseModel):
    trips: list[TripCheck] = Field(default_factory=list)
    checked_events: int = 0


class CalendarConflict(BaseModel):
    type: str = Field(pattern="^(overlap|travel_risk)$")
    event_ids: list[str] = Field(default_factory=list)
    titles: list[str] = Field(default_factory=list)
    detail: str


class CalendarGuardResponse(BaseModel):
    conflicts: list[CalendarConflict] = Field(default_factory=list)
    checked_events: int = 0
