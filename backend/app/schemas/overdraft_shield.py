from datetime import date
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, Field


class OverdraftKind(str, Enum):
    arranged = "arranged"
    unarranged = "unarranged"


class AccountType(str, Enum):
    current = "current"
    student = "student"
    basic = "basic"


class PriorComplaint(str, Enum):
    none = "none"
    informal = "informal"
    formal_pending = "formal_pending"
    bank_refused = "bank_refused"
    eight_weeks = "eight_weeks"


class ShieldPathway(str, Enum):
    bank_complaint = "bank_complaint"
    chase_final_response = "chase_final_response"
    fos_referral = "fos_referral"
    vulnerability_support = "vulnerability_support"


class OverdraftShieldRequest(BaseModel):
    bank_name: str = Field(..., min_length=1, max_length=120)
    bank_address: str | None = Field(default=None, max_length=240)
    customer_name: str | None = Field(default=None, max_length=80)
    account_type: AccountType = AccountType.current
    overdraft_kind: OverdraftKind = OverdraftKind.unarranged
    fee_amount: Decimal = Field(..., gt=0, le=100000)
    fee_date: date
    account_last4: str | None = Field(default=None, max_length=4, pattern=r"^\d{4}$")
    fee_description: str = Field(..., min_length=3, max_length=2000)
    prior_complaint: PriorComplaint = PriorComplaint.none
    struggling: bool = False
    proof_filename: str | None = Field(default=None, max_length=180)
    locale: str = Field(default="en", pattern="^(en|fa)$")


class OverdraftShieldPathwayInfo(BaseModel):
    id: ShieldPathway
    label: str
    window: str
    notes: str


class OverdraftShieldResponse(BaseModel):
    pathway: ShieldPathway
    pathway_label: str
    days_since_fee: int
    overdraft_kind: OverdraftKind
    can_refer_fos: bool
    fos_url: str
    statute_refs: list[str]
    summary: str
    guideline: str
    notice_draft: str
    next_steps: list[str]
    bank_name: str
    fee_amount: Decimal
    proof_filename: str | None = None
