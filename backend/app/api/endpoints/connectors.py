from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_user
from app.schemas.connectors import (
    CalendarEventSummary,
    GmailMessageSummary,
    GoogleAccessLevel,
    GoogleConnectorStatus,
    GoogleConnectStart,
)
from app.services.google_connector import (
    ConnectorNotConfiguredError,
    ConnectorNotConnectedError,
    ConnectorPermissionError,
    ConnectorUpstreamError,
    begin,
    complete,
    disconnect,
    recent_gmail,
    status,
    upcoming_calendar,
)

router = APIRouter(prefix="/connectors/google", tags=["connectors"])


def _raise_connector(exc: Exception) -> None:
    if isinstance(exc, ConnectorNotConfiguredError):
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if isinstance(exc, ConnectorNotConnectedError):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if isinstance(exc, ConnectorPermissionError):
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if isinstance(exc, ConnectorUpstreamError):
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    raise exc


@router.get("/status", response_model=GoogleConnectorStatus)
def connector_status(user_id: str = Depends(require_user)) -> GoogleConnectorStatus:
    return status(user_id)


@router.post("/start", response_model=GoogleConnectStart)
def start(
    access: GoogleAccessLevel = Query(default=GoogleAccessLevel.read),
    user_id: str = Depends(require_user),
) -> GoogleConnectStart:
    try:
        return GoogleConnectStart(authorization_url=begin(user_id, access))
    except Exception as exc:
        _raise_connector(exc)
        raise


@router.get("/callback")
def callback(state: str, code: str) -> dict[str, bool]:
    try:
        complete(state, code)
        return {"connected": True}
    except Exception as exc:
        _raise_connector(exc)
        raise


@router.get("/gmail/recent", response_model=list[GmailMessageSummary])
def gmail_recent(
    limit: int = Query(default=10, ge=1, le=20),
    user_id: str = Depends(require_user),
) -> list[GmailMessageSummary]:
    try:
        return recent_gmail(user_id, limit)
    except Exception as exc:
        _raise_connector(exc)
        raise


@router.get("/calendar/upcoming", response_model=list[CalendarEventSummary])
def calendar_upcoming(
    limit: int = Query(default=10, ge=1, le=20),
    user_id: str = Depends(require_user),
) -> list[CalendarEventSummary]:
    try:
        return upcoming_calendar(user_id, limit)
    except Exception as exc:
        _raise_connector(exc)
        raise


@router.delete("")
def remove_connection(user_id: str = Depends(require_user)) -> dict[str, bool]:
    disconnect(user_id)
    return {"disconnected": True}
