from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class GoogleAccessLevel(str, Enum):
    read = "read"
    write = "write"


class GoogleConnectorStatus(BaseModel):
    configured: bool
    connected: bool
    scopes: list[str] = Field(default_factory=list)
    expires_at: datetime | None = None


class GoogleConnectStart(BaseModel):
    authorization_url: str


class GmailMessageSummary(BaseModel):
    id: str
    thread_id: str | None = None
    subject: str = ""
    sender: str = ""
    date: str = ""
    snippet: str = ""


class CalendarEventSummary(BaseModel):
    id: str
    summary: str = ""
    start: str = ""
    end: str = ""
    html_link: str | None = None


class GmailSendRequest(BaseModel):
    to: str = Field(..., min_length=3, max_length=320)
    subject: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=10000)


class CalendarEventCreate(BaseModel):
    summary: str = Field(..., min_length=1, max_length=240)
    start: str = Field(..., min_length=10, max_length=64)
    end: str = Field(..., min_length=10, max_length=64)
    description: str | None = Field(default=None, max_length=4000)
    timezone: str = Field(default="Europe/London", max_length=80)
