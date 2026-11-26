"""Schemas for the Outcome Verifier.

A verification says whether an obligation or a promise actually happened,
checked against the owner's Gmail. The check is deterministic (keyword
signals over the recent mailbox), never an LLM guess, and the result is
persisted in the Life Graph so the owner can see it later.
"""

from datetime import datetime

from pydantic import BaseModel, Field


class VerifyRequest(BaseModel):
    kind: str = Field(pattern="^(obligation|promise)$")
    source_id: str = Field(min_length=1, max_length=128)


class VerificationResult(BaseModel):
    source_id: str
    kind: str
    status: str = Field(pattern="^(verified|awaiting|failed)$")
    evidence_message_id: str | None = None
    matched_text: str | None = None
    checked_at: datetime
    detail: str
