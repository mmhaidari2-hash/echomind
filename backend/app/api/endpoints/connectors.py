from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse

from app.auth import require_user
from app.schemas.connectors import (
    CalendarEventSummary,
    GmailCleanupPreview,
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
    preview_gmail_cleanup,
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


@router.get("/callback", response_class=HTMLResponse)
def callback(state: str, code: str) -> HTMLResponse:
    try:
        complete(state, code)
    except Exception as exc:
        _raise_connector(exc)
        raise
    html = """<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EchoMind connected</title></head>
<body style="font-family:system-ui;background:#090d16;color:#e2e8f0;padding:32px">
  <main style="max-width:520px;margin:auto">
    <h1>Google connected</h1>
    <p>You can return to EchoMind now.</p>
    <a href="echomind://oauth/google?connected=1" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#7dd3fc;color:#07111f;text-decoration:none;font-weight:700">Return to EchoMind</a>
  </main>
</body>
</html>"""
    return HTMLResponse(content=html, status_code=200)


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


@router.get("/gmail/cleanup-preview", response_model=GmailCleanupPreview)
def gmail_cleanup_preview(
    days: int = Query(default=30, ge=7, le=3650),
    limit: int = Query(default=20, ge=1, le=50),
    user_id: str = Depends(require_user),
) -> GmailCleanupPreview:
    try:
        return preview_gmail_cleanup(user_id, days=days, limit=limit)
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
