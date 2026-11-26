"""Morning Brief endpoint.

GET /brief/today returns the deterministic daily digest for the owner,
in English or Persian. Read-only.
"""

from fastapi import APIRouter, Depends, Query

from app.auth import require_user
from app.schemas.brief import MorningBrief
from app.services.briefing import today_brief

router = APIRouter(prefix="/brief", tags=["brief"])


@router.get("/today", response_model=MorningBrief)
def today(
    locale: str = Query(default="en", pattern="^(en|fa)$"),
    user_id: str = Depends(require_user),
) -> MorningBrief:
    return today_brief(user_id, locale=locale)
