"""Schemas for Inbox Watch: Gmail-driven obligation detection proposals.

A proposal is never an obligation by itself. It is a suggestion with its
evidence attached (the Gmail message it came from). Turning a proposal into
an obligation or a promise goes through the Bounded Authority flow
(POST /authority/actions -> confirm), so nothing is ever created from an
email without the owner's explicit confirmation.
"""

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field


class DetectionKind(str, Enum):
    delay_repay = "delay_repay"
    payment_due = "payment_due"
    refund_promised = "refund_promised"
    renewal = "renewal"


class DetectionTarget(str, Enum):
    obligation = "obligation"
    promise = "promise"


class DetectionStatus(str, Enum):
    new = "new"
    already_recorded = "already_recorded"
    dismissed = "dismissed"


class DetectionProposal(BaseModel):
    id: str
    kind: DetectionKind
    target: DetectionTarget
    title: str
    due_date: date | None = None
    # True when the due date was estimated from the email date because the
    # message did not state the underlying date (e.g. journey date). The
    # reason text always says so; the date is never presented as certain.
    due_date_estimated: bool = False
    counterparty: str | None = None
    promise_text: str | None = None
    reason: str
    confidence: str = "medium"
    evidence_message_id: str
    evidence_subject: str = ""
    evidence_sender: str = ""
    status: DetectionStatus = DetectionStatus.new
    claim_url: str | None = None
    notes: str | None = None


class DetectionScanResult(BaseModel):
    scanned: int
    proposals: list[DetectionProposal] = Field(default_factory=list)
    scanned_at: datetime
