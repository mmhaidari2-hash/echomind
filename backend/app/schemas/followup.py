"""Schemas for Promise Chaser: follow-up cadence and draft chase emails.

A promise is only worth recording if somebody chases it. These schemas
describe the follow-up steps for one promise and the draft email that
chases it. A draft is never sent by this module: the owner proposes it
through Bounded Authority (tool gmail.send) and confirms it first.
"""

from datetime import date
from enum import Enum

from pydantic import BaseModel, Field


class FollowupStepKind(str, Enum):
    check = "check"
    verify = "verify"
    chase = "chase"
    escalate = "escalate"


class FollowupStep(BaseModel):
    id: str
    step: FollowupStepKind
    due_date: date | None = None
    label: str
    detail: str
    state: str = "upcoming"


class FollowupDraft(BaseModel):
    to: str = ""
    subject: str
    body: str
    to_missing: bool = False


class FollowupDraftResponse(BaseModel):
    promise_id: str
    step: FollowupStepKind
    draft: FollowupDraft
    authority_proposal: dict[str, object] = Field(default_factory=dict)
