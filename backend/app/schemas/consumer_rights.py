from datetime import date
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, Field


class PurchaseKind(str, Enum):
    goods = "goods"
    digital = "digital"
    services = "services"


class PriorRemedy(str, Enum):
    none = "none"
    repair_attempted = "repair_attempted"
    replacement_attempted = "replacement_attempted"
    trader_refused = "trader_refused"


class DesiredRemedy(str, Enum):
    auto = "auto"
    refund = "refund"
    repair = "repair"
    replacement = "replacement"
    price_reduction = "price_reduction"


class RightsPathway(str, Enum):
    short_term_reject = "short_term_reject"
    repair_or_replace = "repair_or_replace"
    final_right_to_reject = "final_right_to_reject"
    price_reduction = "price_reduction"
    burden_shift_guidance = "burden_shift_guidance"


class ConsumerRightsRequest(BaseModel):
    retailer_name: str = Field(..., min_length=1, max_length=120)
    retailer_address: str | None = Field(default=None, max_length=240)
    consumer_name: str | None = Field(default=None, max_length=80)
    item_description: str = Field(..., min_length=1, max_length=180)
    purchase_kind: PurchaseKind = PurchaseKind.goods
    purchase_date: date
    delivery_date: date | None = None
    purchase_price: Decimal = Field(..., gt=0, le=100000)
    order_reference: str | None = Field(default=None, max_length=64)
    fault_description: str = Field(..., min_length=3, max_length=2000)
    prior_remedy: PriorRemedy = PriorRemedy.none
    desired_remedy: DesiredRemedy = DesiredRemedy.auto
    proof_filename: str | None = Field(default=None, max_length=180)
    locale: str = Field(default="en", pattern="^(en|fa)$")


class ConsumerRightsPathwayInfo(BaseModel):
    id: RightsPathway
    label: str
    window: str
    notes: str


class ConsumerRightsResponse(BaseModel):
    pathway: RightsPathway
    pathway_label: str
    recommended_remedy: DesiredRemedy
    days_since_delivery: int
    within_30_days: bool
    within_6_months: bool
    burden_on_trader: bool
    statute_refs: list[str]
    summary: str
    guideline: str
    notice_draft: str
    next_steps: list[str]
    retailer_name: str
    item_description: str
    purchase_price: Decimal
    order_reference: str | None = None
    proof_filename: str | None = None
