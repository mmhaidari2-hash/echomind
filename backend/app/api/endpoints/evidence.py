"""Evidence Locker endpoint.

GET /life/evidence-pack returns every obligation and promise with a
completeness score and the evidence behind it, as one exportable pack.
Read-only. Evidence that cannot be fetched is marked unavailable, never
silently dropped.
"""

from fastapi import APIRouter, Depends, Query

from app.auth import require_user
from app.schemas.brief import EvidencePack
from app.services.evidence import evidence_pack

router = APIRouter(prefix="/life", tags=["life"])


@router.get("/evidence-pack", response_model=EvidencePack)
def pack(
    include_closed: bool = Query(default=False),
    user_id: str = Depends(require_user),
) -> EvidencePack:
    return evidence_pack(user_id, include_closed=include_closed)
