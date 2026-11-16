from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class ActionStatus(str, Enum):
    proposed = "proposed"
    executed = "executed"
    failed = "failed"
    cancelled = "cancelled"


class ActionProposalCreate(BaseModel):
    tool: str = Field(..., min_length=1, max_length=80)
    summary: str = Field(..., min_length=1, max_length=240)
    parameters: dict[str, object] = Field(default_factory=dict)
    evidence_ids: list[str] = Field(default_factory=list, max_length=12)
    idempotency_key: str | None = Field(default=None, max_length=80)


class ActionProposal(BaseModel):
    id: str
    tool: str
    summary: str
    parameters: dict[str, object]
    evidence_ids: list[str]
    idempotency_key: str
    status: ActionStatus
    created_at: datetime
    expires_at: datetime
    confirmed_at: datetime | None = None
    executed_at: datetime | None = None
    result: dict[str, object] | None = None


class ActionConfirm(BaseModel):
    confirm: bool


class AuditEvent(BaseModel):
    id: str
    action_id: str
    event: str
    created_at: datetime
    detail: str | None = None
