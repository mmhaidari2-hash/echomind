from datetime import date
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, Field


class WatchKind(str, Enum):
    purchase = "purchase"
    delay_repay = "delay_repay"
    overdraft = "overdraft"
    balance = "balance"


class AlertSeverity(str, Enum):
    urgent = "urgent"
    soon = "soon"
    watch = "watch"
    info = "info"


class WatchCreate(BaseModel):
    kind: WatchKind
    title: str = Field(..., min_length=1, max_length=160)
    anchor_date: date | None = None
    amount: Decimal | None = Field(default=None, ge=0, le=1000000)
    threshold: Decimal | None = Field(default=None, ge=0, le=1000000)
    locale: str = Field(default="en", pattern="^(en|fa)$")
    metadata: dict[str, str] = Field(default_factory=dict)


class WatchRecord(WatchCreate):
    id: str


class Alert(BaseModel):
    id: str
    watch_id: str
    kind: WatchKind
    severity: AlertSeverity
    title: str
    message: str
    days_remaining: int | None = None
    action_pillar: str | None = None
    action_label: str | None = None


class Recommendation(BaseModel):
    id: str
    title: str
    reason: str
    action_pillar: str
    action_label: str
    priority: int


class AlertBundle(BaseModel):
    alerts: list[Alert]
    recommendations: list[Recommendation]
    tracked: int


class EvaluateRequest(BaseModel):
    watches: list[WatchCreate] = Field(default_factory=list)
    locale: str = Field(default="en", pattern="^(en|fa)$")
    balance: Decimal | None = Field(default=None, ge=0, le=1000000)
    balance_threshold: Decimal | None = Field(default=None, ge=0, le=1000000)
