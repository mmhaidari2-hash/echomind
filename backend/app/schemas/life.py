from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field


class LifeNodeKind(str, Enum):
    person = "person"
    organisation = "organisation"
    place = "place"
    account = "account"
    case = "case"
    document = "document"
    obligation = "obligation"
    promise = "promise"
    outcome = "outcome"


class LifeNodeCreate(BaseModel):
    kind: LifeNodeKind
    label: str = Field(..., min_length=1, max_length=160)
    attributes: dict[str, str] = Field(default_factory=dict)


class LifeNode(LifeNodeCreate):
    id: str
    created_at: datetime
    updated_at: datetime


class LifeEdgeCreate(BaseModel):
    source_id: str = Field(..., min_length=1, max_length=40)
    target_id: str = Field(..., min_length=1, max_length=40)
    relation: str = Field(..., min_length=1, max_length=80)


class LifeEdge(LifeEdgeCreate):
    id: str
    created_at: datetime


class ObligationStatus(str, Enum):
    open = "open"
    due_soon = "due_soon"
    overdue = "overdue"
    completed = "completed"
    cancelled = "cancelled"


class ObligationCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    due_date: date | None = None
    source: str = Field(default="user", max_length=40)
    related_node_ids: list[str] = Field(default_factory=list, max_length=20)
    evidence_ids: list[str] = Field(default_factory=list, max_length=20)
    notes: str | None = Field(default=None, max_length=1000)


class Obligation(ObligationCreate):
    id: str
    status: ObligationStatus
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None


class PromiseStatus(str, Enum):
    open = "open"
    kept = "kept"
    broken = "broken"
    cancelled = "cancelled"


class PromiseCreate(BaseModel):
    counterparty: str = Field(..., min_length=1, max_length=160)
    promise: str = Field(..., min_length=1, max_length=500)
    due_date: date | None = None
    related_node_ids: list[str] = Field(default_factory=list, max_length=20)
    evidence_ids: list[str] = Field(default_factory=list, max_length=20)


class PromiseRecord(PromiseCreate):
    id: str
    status: PromiseStatus
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None = None


class LifeSnapshot(BaseModel):
    nodes: list[LifeNode]
    edges: list[LifeEdge]
    obligations: list[Obligation]
    promises: list[PromiseRecord]
