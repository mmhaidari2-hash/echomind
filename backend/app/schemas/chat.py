from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class PillarId(str, Enum):
    delay_repay = "delay_repay"
    consumer_rights = "consumer_rights"
    overdraft_shield = "overdraft_shield"


class ChatMetadata(BaseModel):
    intent: str | None = Field(default=None, max_length=64)
    source: str | None = Field(default=None, max_length=64)
    attachment_names: list[str] = Field(default_factory=list, max_length=8)
    memory_hints: list[str] = Field(default_factory=list, max_length=8)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    conversation_id: str | None = Field(default=None, max_length=64)
    locale: str = Field(default="en", pattern="^(en|fa)$")
    metadata: ChatMetadata = Field(default_factory=ChatMetadata)


class ChatResponse(BaseModel):
    conversation_id: str
    pillar: PillarId
    title: str
    message: str
    steps: list[str]
    engine: str = "placeholder"
    status: str = "ok"
    metadata: dict[str, Any] = Field(default_factory=dict)
