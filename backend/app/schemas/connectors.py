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
    # RFC Message-ID header, when Gmail returns it. A reply in the same
    # thread needs it for In-Reply-To / References.
    message_id_header: str | None = None


class CalendarEventSummary(BaseModel):
    id: str
    summary: str = ""
    start: str = ""
    end: str = ""
    location: str = ""
    html_link: str | None = None


class GmailSendRequest(BaseModel):
    to: str = Field(..., min_length=3, max_length=320)
    subject: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=10000)
    # Reply in the same thread, Shortwave/Lindy-style: threadId keeps the
    # message in the thread, in_reply_to is the original Message-ID header.
    thread_id: str | None = Field(default=None, max_length=64)
    in_reply_to: str | None = Field(default=None, max_length=320)


class CalendarEventCreate(BaseModel):
    summary: str = Field(..., min_length=1, max_length=240)
    start: str = Field(..., min_length=10, max_length=64)
    end: str = Field(..., min_length=10, max_length=64)
    description: str | None = Field(default=None, max_length=4000)
    timezone: str = Field(default="Europe/London", max_length=80)


class GmailCleanupPreview(BaseModel):
    query: str
    candidates: list[GmailMessageSummary] = Field(default_factory=list)


class GmailTrashRequest(BaseModel):
    message_ids: list[str] = Field(..., min_length=1, max_length=50)


# --- Instagram (Instagram API with Instagram Login, read-only) ---


class InstagramConnectorStatus(BaseModel):
    configured: bool
    connected: bool
    username: str | None = None


class InstagramConnectStart(BaseModel):
    authorization_url: str


class InstagramProfile(BaseModel):
    id: str = ""
    username: str = ""
    account_type: str = ""
    media_count: int = 0


class InstagramMediaItem(BaseModel):
    id: str
    caption: str | None = None
    media_type: str = ""
    media_url: str | None = None
    permalink: str | None = None
    timestamp: str = ""


# --- YouTube (Google OAuth, youtube.readonly, read-only) ---


class YouTubeConnectorStatus(BaseModel):
    configured: bool
    connected: bool
    scopes: list[str] = Field(default_factory=list)


class YouTubeConnectStart(BaseModel):
    authorization_url: str


class YouTubeChannel(BaseModel):
    id: str = ""
    title: str = ""
    description: str = ""
    subscribers: int = 0
    video_count: int = 0
    thumbnail_url: str | None = None
    uploads_playlist_id: str | None = None


class YouTubeVideo(BaseModel):
    id: str
    title: str = ""
    published_at: str = ""
    thumbnail_url: str | None = None
    url: str | None = None


# --- Bank (UK Open Banking via TrueLayer, read-only) ---


class BankConnectorStatus(BaseModel):
    configured: bool
    connected: bool
    provider: str = "TrueLayer"
    environment: str = "sandbox"


class BankConnectStart(BaseModel):
    authorization_url: str


class BankAccount(BaseModel):
    id: str
    name: str = ""
    type: str = ""
    currency: str = ""
    provider: str = ""
    balance: float | None = None


class BankTransaction(BaseModel):
    id: str
    account_id: str
    amount: float = 0
    currency: str = ""
    description: str = ""
    date: str = ""
    category: str | None = None
