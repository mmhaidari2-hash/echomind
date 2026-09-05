from fastapi import APIRouter

from app.schemas.overdraft_shield import (
    OverdraftShieldPathwayInfo,
    OverdraftShieldRequest,
    OverdraftShieldResponse,
)
from app.services.overdraft_shield import evaluate_shield, list_pathways

router = APIRouter(prefix="/overdraft-shield", tags=["overdraft-shield"])


@router.get("/pathways", response_model=list[OverdraftShieldPathwayInfo])
def pathways() -> list[OverdraftShieldPathwayInfo]:
    return list_pathways()


@router.post("/notices", response_model=OverdraftShieldResponse)
def submit_notice(payload: OverdraftShieldRequest) -> OverdraftShieldResponse:
    return evaluate_shield(payload)
