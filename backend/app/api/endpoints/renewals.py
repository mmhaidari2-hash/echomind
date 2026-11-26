"""Renewal Guard endpoint.

GET /life/renewals lists the owner's renewal obligations with their
decision deadlines and annual costs. Read-only: nothing is cancelled
from here.
"""

from fastapi import APIRouter, Depends

from app.auth import require_user
from app.schemas.renewals import RenewalGuardResponse
from app.services.renewals import renewal_guard

router = APIRouter(prefix="/life", tags=["life"])


@router.get("/renewals", response_model=RenewalGuardResponse)
def renewals(user_id: str = Depends(require_user)) -> RenewalGuardResponse:
    return renewal_guard(user_id)
