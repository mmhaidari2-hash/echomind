"""Delay Repay Claim Pack endpoint.

POST /delay-repay/pack is the same calculator as /delay-repay/claims
plus the filing deadline, claim page, evidence checklist and the filing
obligation payload. Like /claims it needs no login: the obligation itself
is created by the owner through Bounded Authority.
"""

from fastapi import APIRouter, Query

from app.schemas.claim_pack import ClaimPack
from app.schemas.delay_repay import DelayRepayClaimRequest
from app.services.claim_pack import build_claim_pack

router = APIRouter(prefix="/delay-repay", tags=["delay-repay"])


@router.post("/pack", response_model=ClaimPack)
def pack(
    payload: DelayRepayClaimRequest,
    evidence_message_id: str | None = Query(default=None),
) -> ClaimPack:
    return build_claim_pack(payload, evidence_message_id=evidence_message_id)
