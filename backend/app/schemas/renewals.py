"""Schemas for Renewal Guard.

A renewal is a decision, not just a date. The guard reads renewal
obligations, works out the decision deadline (7 days before the renewal),
pulls the annual cost out of the text, and offers the three choices
(keep / cancel / switch) plus a calendar blocker for the decision day.
"""

from datetime import date

from pydantic import BaseModel, Field


class RenewalItem(BaseModel):
    obligation_id: str
    title: str
    renewal_date: date | None = None
    decision_deadline: date | None = None
    annual_cost_gbp: float | None = None
    currency: str = "GBP"
    status: str
    actions: dict[str, str] = Field(default_factory=dict)
    calendar_blocker: dict[str, object] = Field(default_factory=dict)


class RenewalGuardResponse(BaseModel):
    renewals: list[RenewalItem] = Field(default_factory=list)
    total_annual_cost_gbp: float = 0.0
