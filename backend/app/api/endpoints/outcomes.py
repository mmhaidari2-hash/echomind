from fastapi import APIRouter, Depends

from app.auth import require_user
from app.schemas.outcomes import OutcomeItem
from app.services.outcomes import pending_outcomes

router = APIRouter(prefix="/outcomes", tags=["outcomes"])


@router.get("", response_model=list[OutcomeItem])
def outcomes(user_id: str = Depends(require_user)) -> list[OutcomeItem]:
    return pending_outcomes(user_id)
