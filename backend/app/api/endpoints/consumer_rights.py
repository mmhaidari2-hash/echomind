from fastapi import APIRouter

from app.schemas.consumer_rights import (
    ConsumerRightsPathwayInfo,
    ConsumerRightsRequest,
    ConsumerRightsResponse,
)
from app.services.consumer_rights import evaluate_rights, list_pathways

router = APIRouter(prefix="/consumer-rights", tags=["consumer-rights"])


@router.get("/pathways", response_model=list[ConsumerRightsPathwayInfo])
def pathways() -> list[ConsumerRightsPathwayInfo]:
    return list_pathways()


@router.post("/notices", response_model=ConsumerRightsResponse)
def submit_notice(payload: ConsumerRightsRequest) -> ConsumerRightsResponse:
    return evaluate_rights(payload)
