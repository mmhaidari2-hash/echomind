from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class MemorySource(str, Enum):
    chat = "chat"
    document = "document"
    watch = "watch"
    preference = "preference"
    location = "location"


class MemoryFact(BaseModel):
    id: str
    key: str = Field(..., min_length=1, max_length=80)
    value: str = Field(..., min_length=1, max_length=240)
    source: MemorySource = MemorySource.chat
    created_at: datetime


class MemoryFactCreate(BaseModel):
    key: str = Field(..., min_length=1, max_length=80)
    value: str = Field(..., min_length=1, max_length=240)
    source: MemorySource = MemorySource.chat


class MemoryRecallRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=800)
    limit: int = Field(default=6, ge=1, le=12)


class MemoryRecallResponse(BaseModel):
    facts: list[MemoryFact]
    hints: list[str]


class UserPreferences(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    # locale is retained for backward compatibility with the current UI.
    locale: str = Field(default="en", pattern="^(en|fa)$")
    ui_language: str = Field(default="en", pattern="^(en|fa)$")
    command_language: str = Field(default="auto", pattern="^(auto|en|fa)$")
    external_language: str = Field(default="en-GB", max_length=16)
    home_market: str = Field(default="GB", min_length=2, max_length=8)
    jurisdiction: str = Field(default="GB", min_length=2, max_length=16)
    currency: str = Field(default="GBP", min_length=3, max_length=3)
    travel_destination: str | None = Field(default=None, max_length=120)
    home_station: str | None = Field(default=None, max_length=80)
    work_station: str | None = Field(default=None, max_length=80)
    preferred_operator: str | None = Field(default=None, max_length=40)
    preferred_retailer: str | None = Field(default=None, max_length=80)
    preferred_bank: str | None = Field(default=None, max_length=80)
    tone: str = Field(default="concise", pattern="^(concise|detailed)$")


class ContextTag(BaseModel):
    id: str
    label: str = Field(..., min_length=1, max_length=40)
    active: bool = True


class ContextTagCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=40)
    active: bool = True


class ContextTagUpdate(BaseModel):
    tags: list[ContextTagCreate] = Field(default_factory=list, max_length=16)


class ConversationTurn(BaseModel):
    conversation_id: str
    role: str = Field(..., pattern="^(user|assistant)$")
    text: str = Field(..., max_length=800)
    pillar: str | None = None
    created_at: datetime


class MemoryProfile(BaseModel):
    preferences: UserPreferences
    tags: list[ContextTag] = Field(default_factory=list)
    locations: list[str] = Field(default_factory=list)
    facts: list[MemoryFact] = Field(default_factory=list)
    recent_turns: list[ConversationTurn] = Field(default_factory=list)


class ActiveContext(BaseModel):
    preferences: UserPreferences
    tags: list[str]
    locations: list[str]
    hints: list[str]
    last_pillar: str | None = None
    prompt_chars: int = 0
