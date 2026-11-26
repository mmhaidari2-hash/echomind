"""Schemas for the Delay Repay Claim Pack.

One call returns everything the owner needs to file a claim: the estimate
and draft letter from the existing claim evaluator, the filing deadline
(journey date + 28 days, the operator rule), the operator's claim page,
an evidence checklist, and the filing obligation the owner can record in
the Life Graph through Bounded Authority.
"""

from datetime import date

from pydantic import BaseModel, Field

from app.schemas.delay_repay import DelayRepayClaimResponse


class ClaimPack(DelayRepayClaimResponse):
    filing_deadline: date | None = None
    filing_deadline_estimated: bool = False
    claim_url: str | None = None
    evidence_checklist: list[str] = Field(default_factory=list)
    filing_obligation: dict[str, object] = Field(default_factory=dict)
    next_steps: list[str] = Field(default_factory=list)
