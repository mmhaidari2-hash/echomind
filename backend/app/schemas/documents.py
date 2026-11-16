from datetime import datetime
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, Field


class DocumentKind(str, Enum):
    train_ticket = "train_ticket"
    receipt = "receipt"
    invoice = "invoice"
    bank_statement = "bank_statement"
    unknown = "unknown"


class ExtractedEntities(BaseModel):
    amounts: list[Decimal] = Field(default_factory=list)
    dates: list[str] = Field(default_factory=list)
    vendors: list[str] = Field(default_factory=list)
    operator_id: str | None = None
    operator_name: str | None = None
    origin: str | None = None
    destination: str | None = None
    ticket_type: str | None = None
    ticket_reference: str | None = None
    delay_minutes: int | None = None
    item_description: str | None = None
    passenger_name: str | None = None


class DelayRepayPrefill(BaseModel):
    operator: str | None = None
    origin: str | None = None
    destination: str | None = None
    journey_date: str | None = None
    delay_minutes: int | None = None
    ticket_type: str | None = None
    ticket_cost: Decimal | None = None
    ticket_reference: str | None = None
    proof_filename: str | None = None
    passenger_name: str | None = None


class ConsumerRightsPrefill(BaseModel):
    retailer_name: str | None = None
    item_description: str | None = None
    purchase_date: str | None = None
    purchase_price: Decimal | None = None
    order_reference: str | None = None
    proof_filename: str | None = None


class OverdraftPrefill(BaseModel):
    bank_name: str | None = None
    fee_amount: Decimal | None = None
    fee_date: str | None = None
    proof_filename: str | None = None


class DocumentParseRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=20000)
    filename: str | None = Field(default=None, max_length=180)
    locale: str = Field(default="en", pattern="^(en|fa)$")


class EvidenceMetadata(BaseModel):
    id: str
    sha256: str = Field(..., min_length=64, max_length=64)
    filename: str | None = Field(default=None, max_length=180)
    content_type: str = Field(..., max_length=120)
    size_bytes: int = Field(ge=0, le=8 * 1024 * 1024)
    kind: DocumentKind
    summary: str = Field(..., max_length=500)
    created_at: datetime


class DocumentParseResponse(BaseModel):
    kind: DocumentKind
    filename: str | None = None
    extracted_text: str
    entities: ExtractedEntities
    suggested_pillar: str | None = None
    delay_repay: DelayRepayPrefill | None = None
    consumer_rights: ConsumerRightsPrefill | None = None
    overdraft_shield: OverdraftPrefill | None = None
    summary: str
    confidence: float = 0.0
