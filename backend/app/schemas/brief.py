"""Schemas for the Morning Brief and the Evidence Locker.

Morning Brief: one deterministic daily digest, ranked by urgency, in the
owner's language. No LLM, no generated prose beyond fixed templates.

Evidence Locker: every obligation and promise with a completeness score
and the evidence behind it, exportable as one JSON pack for a court, an
ombudsman or the Financial Ombudsman Service.
"""

from datetime import date, datetime

from pydantic import BaseModel, Field


class BriefItem(BaseModel):
    priority: int
    kind: str
    title: str
    reason: str
    due_date: date | None = None


class MorningBrief(BaseModel):
    date: date
    locale: str
    items: list[BriefItem] = Field(default_factory=list)
    counts: dict[str, int] = Field(default_factory=dict)


class EvidenceDetail(BaseModel):
    message_id: str
    subject: str = ""
    sender: str = ""
    date: str = ""
    available: bool = False


class EvidenceItem(BaseModel):
    kind: str
    id: str
    title: str
    counterparty: str = ""
    due_date: date | None = None
    status: str
    completeness: int
    evidence: list[EvidenceDetail] = Field(default_factory=list)


class EvidencePack(BaseModel):
    generated_at: datetime
    items: list[EvidenceItem] = Field(default_factory=list)
    total: int = 0
    complete: int = 0
