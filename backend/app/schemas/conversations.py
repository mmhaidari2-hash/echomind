from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.memory import ConversationTurn


class ConversationSummary(BaseModel):
    conversation_id: str
    title: str
    message_count: int = Field(ge=1)
    updated_at: datetime


class ConversationDetail(BaseModel):
    conversation_id: str
    turns: list[ConversationTurn]
