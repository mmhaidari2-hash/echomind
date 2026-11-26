"""Schemas for scheduled watches — the Lindy gap.

A watch is a standing instruction: "when X happens, propose Y".
Evaluation is deterministic and never executes anything on its own:
it produces proposals with evidence, and the owner accepts each one
through Bounded Authority (accepting creates an obligation — the
follow-up draft travels in the obligation's notes, to be sent only
through the existing gmail.send confirmation flow).
"""

from datetime import datetime

from pydantic import BaseModel, Field


class WatchCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    trigger: str = Field(..., pattern="^(gmail_query|promise_overdue|unanswered_mail)$")
    condition: dict[str, object] = Field(default_factory=dict)
    action: str = Field(default="create_obligation", pattern="^(create_obligation|draft_followup)$")
    enabled: bool = True


class WatchRecord(WatchCreate):
    id: str
    created_at: datetime
    updated_at: datetime
    last_evaluated_at: datetime | None = None
    last_result_count: int = 0


class WatchProposal(BaseModel):
    id: str
    watch_id: str
    action: str
    title: str
    detail: str = ""
    evidence_message_id: str | None = None
    evidence_subject: str = ""
    evidence_sender: str = ""
    draft_to: str = ""
    draft_subject: str = ""
    draft_body: str = ""
    obligation_title: str = ""
    obligation_notes: str = ""
    status: str = "proposed"  # proposed | accepted | dismissed
    obligation_id: str | None = None
    created_at: datetime


class WatchEvaluateResult(BaseModel):
    watch_id: str
    evaluated_at: datetime
    new_proposals: int
    proposals: list[WatchProposal] = Field(default_factory=list)
