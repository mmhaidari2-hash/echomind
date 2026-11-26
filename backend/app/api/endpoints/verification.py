"""Outcome Verifier endpoints.

POST /outcomes/verify runs a deterministic Gmail check for one obligation
or promise and stores the result. GET /outcomes/{id}/verification returns
the last stored result, or 404 when nothing was ever checked.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_user
from app.schemas.verification import VerificationResult, VerifyRequest
from app.services import google_connector as connector
from app.services import verification as verification_service

router = APIRouter(prefix="/outcomes", tags=["outcomes"])


@router.post("/verify", response_model=VerificationResult)
def verify(payload: VerifyRequest, user_id: str = Depends(require_user)) -> VerificationResult:
    try:
        return verification_service.verify_outcome(user_id, payload.kind, payload.source_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except connector.ConnectorNotConnectedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except connector.ConnectorNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/{source_id}/verification", response_model=VerificationResult)
def stored(source_id: str, user_id: str = Depends(require_user)) -> VerificationResult:
    result = verification_service.stored_verification(user_id, source_id)
    if result is None:
        raise HTTPException(status_code=404, detail="No verification stored for this record")
    return result
