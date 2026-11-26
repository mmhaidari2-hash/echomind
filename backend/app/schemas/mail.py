"""Schemas for mail actions: snooze and unanswered-mail chase.

A snooze parks an email and resurfaces it as an obligation on the date
the owner chose. An unanswered thread is a sent email nobody replied
to — the proposal carries a follow-up draft, never sends anything.
"""

from datetime import date, datetime

from pydantic import BaseModel, Field


class SnoozeCreate(BaseModel):
    message_id: str = Field(..., min_length=1, max_length=64)
    snooze_until: date
    locale: str = Field(default="en", pattern="^(en|fa)$")


class SnoozeRecord(BaseModel):
    id: str
    message_id: str
    subject: str = ""
    sender: str = ""
    snooze_until: date
    obligation_id: str | None = None
    status: str = "active"  # active | due | cancelled
    created_at: datetime


class UnansweredThread(BaseModel):
    thread_id: str
    message_id: str
    subject: str = ""
    recipient: str = ""
    sent_date: str = ""
    days_waiting: int
    draft_subject: str
    draft_body: str
