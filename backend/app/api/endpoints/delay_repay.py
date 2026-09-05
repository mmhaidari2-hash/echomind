from fastapi import APIRouter

from app.schemas.delay_repay import (
    DelayRepayClaimRequest,
    DelayRepayClaimResponse,
    DelayRepayOperator,
    DelayRepayTierInfo,
)
from app.services.delay_repay import evaluate_claim, list_operators, list_tiers

router = APIRouter(prefix="/delay-repay", tags=["delay-repay"])


@router.get("/operators", response_model=list[DelayRepayOperator])
def operators() -> list[DelayRepayOperator]:
    return list_operators()


@router.get("/tiers", response_model=list[DelayRepayTierInfo])
def tiers() -> list[DelayRepayTierInfo]:
    return list_tiers()


@router.post("/claims", response_model=DelayRepayClaimResponse)
def submit_claim(payload: DelayRepayClaimRequest) -> DelayRepayClaimResponse:
    return evaluate_claim(payload)
