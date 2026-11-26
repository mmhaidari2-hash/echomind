"""Schemas for the intent layer.

The intent layer is the deterministic front door of chat and voice:
typed Persian, typed English, mixed language, colloquial Persian and
spoken transcripts all land here first. It never calls an LLM and never
writes anything: it names the intent, the entities and the action the
chat layer should take. The chat layer executes the action and builds
the reply.
"""

from datetime import date

from pydantic import BaseModel, Field


class IntentResult(BaseModel):
    intent: str
    confidence: str = Field(pattern="^(high|medium|low)$")
    language: str = Field(pattern="^(fa|en)$")
    entities: dict[str, object] = Field(default_factory=dict)
    action: dict[str, object] = Field(default_factory=dict)
    due_date: date | None = None
