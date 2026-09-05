from datetime import date
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, Field


class TicketType(str, Enum):
    single = "single"
    return_ticket = "return"
    season_weekly = "season_weekly"
    season_monthly = "season_monthly"
    season_annual = "season_annual"


class DelayTier(str, Enum):
    not_eligible = "not_eligible"
    band_15_29 = "15_29"
    band_30_59 = "30_59"
    band_60_plus = "60_plus"
    band_120_plus = "120_plus"


class DelayRepayClaimRequest(BaseModel):
    operator: str = Field(..., min_length=1, max_length=80)
    origin: str | None = Field(default=None, max_length=80)
    destination: str | None = Field(default=None, max_length=80)
    journey_date: date | None = None
    delay_minutes: int = Field(..., ge=0, le=1440)
    scheduled_arrival: str | None = Field(default=None, max_length=16)
    actual_arrival: str | None = Field(default=None, max_length=16)
    ticket_type: TicketType
    ticket_cost: Decimal = Field(..., gt=0, le=10000)
    ticket_reference: str | None = Field(default=None, max_length=64)
    proof_filename: str | None = Field(default=None, max_length=180)
    passenger_name: str | None = Field(default=None, max_length=80)
    locale: str = Field(default="en", pattern="^(en|fa)$")


class DelayRepayOperator(BaseModel):
    id: str
    name: str
    claim_url: str | None = None


class DelayRepayTierInfo(BaseModel):
    id: DelayTier
    label: str
    minutes_min: int
    minutes_max: int | None
    percent: int
    notes: str


class DelayRepayClaimResponse(BaseModel):
    eligible: bool
    tier: DelayTier
    tier_label: str
    delay_minutes: int
    percent: int
    basis_amount: Decimal
    estimate_gbp: Decimal
    currency: str = "GBP"
    guideline: str
    claim_deadline_days: int = 28
    operator_id: str
    operator_name: str
    claim_url: str | None = None
    claim_draft: str
    next_steps: list[str]
    ticket_type: TicketType
    ticket_reference: str | None = None
    proof_filename: str | None = None
