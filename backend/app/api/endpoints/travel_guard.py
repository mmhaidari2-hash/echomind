"""Travel Guard endpoint.

GET /travel/guard cross-checks the owner's upcoming trips against the
inbox. When Google is not connected it fails closed with 409/503 — it
never reports "all clear" from an empty inbox.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_user
from app.schemas.travel_guard import TravelGuardResponse
from app.services import google_connector as connector
from app.services import travel_guard as travel_guard_service

router = APIRouter(prefix="/travel", tags=["travel"])


@router.get("/guard", response_model=TravelGuardResponse)
def guard(user_id: str = Depends(require_user)) -> TravelGuardResponse:
    try:
        return travel_guard_service.travel_guard(user_id)
    except connector.ConnectorNotConnectedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except connector.ConnectorNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
