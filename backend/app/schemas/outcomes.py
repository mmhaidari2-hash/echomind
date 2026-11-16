from datetime import date
from enum import Enum

from pydantic import BaseModel


class OutcomePriority(str, Enum):
    urgent = "urgent"
    soon = "soon"
    watch = "watch"


class OutcomeKind(str, Enum):
    obligation = "obligation"
    promise_verification = "promise_verification"


class OutcomeItem(BaseModel):
    id: str
    kind: OutcomeKind
    priority: OutcomePriority
    title: str
    reason: str
    due_date: date | None = None
    source_id: str
    requires_verification: bool = False
