"""Consumer Rights Case File endpoint.

POST /consumer-rights/cases evaluates the rights pathway and files it as
a case in the Life Graph: case node, statutory deadlines, and the
obligations that guard them.
"""

from fastapi import APIRouter, Depends, Query

from app.auth import require_user
from app.schemas.case_file import CaseFile
from app.schemas.consumer_rights import ConsumerRightsRequest
from app.services.case_file import build_case_file

router = APIRouter(prefix="/consumer-rights", tags=["consumer-rights"])


@router.post("/cases", response_model=CaseFile)
def create_case(
    payload: ConsumerRightsRequest,
    evidence_ids: list[str] | None = Query(default=None),
    user_id: str = Depends(require_user),
) -> CaseFile:
    return build_case_file(user_id, payload, evidence_ids=evidence_ids)
