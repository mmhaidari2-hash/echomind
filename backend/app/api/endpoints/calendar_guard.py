"""Calendar Guard endpoint.

GET /calendar/guard checks the owner's upcoming calendar for overlaps
and impossible travel between events. When Google is not connected it
fails closed with 409/503 — it never reports "all clear" from an empty
calendar.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_user
from app.schemas.travel_guard import CalendarGuardResponse
from app.services import google_connector as connector
from app.services import calendar_guard as calendar_guard_service

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/guard", response_model=CalendarGuardResponse)
def guard(user_id: str = Depends(require_user)) -> CalendarGuardResponse:
    try:
        return calendar_guard_service.calendar_guard(user_id)
    except connector.ConnectorNotConnectedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except connector.ConnectorNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
