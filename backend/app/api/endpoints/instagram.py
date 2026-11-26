from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse

from app.auth import require_user
from app.schemas.connectors import (
    InstagramConnectStart,
    InstagramConnectorStatus,
    InstagramMediaItem,
    InstagramProfile,
)
from app.services.instagram_connector import (
    ConnectorNotConfiguredError,
    ConnectorNotConnectedError,
    ConnectorPermissionError,
    ConnectorUpstreamError,
    begin,
    complete,
    disconnect,
    profile as read_profile,
    recent_media,
    status,
)

router = APIRouter(prefix="/connectors/instagram", tags=["connectors"])


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


@router.get("/status", response_model=InstagramConnectorStatus)
def instagram_status(user_id: str = Depends(require_user)) -> InstagramConnectorStatus:
    return InstagramConnectorStatus(**status(user_id))


@router.post("/start", response_model=InstagramConnectStart)
def start(user_id: str = Depends(require_user)) -> InstagramConnectStart:
    try:
        return InstagramConnectStart(authorization_url=begin(user_id))
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
    <h1>Instagram connected</h1>
    <p>You can return to EchoMind now.</p>
    <a href="echomind://oauth/instagram?connected=1" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#7dd3fc;color:#07111f;text-decoration:none;font-weight:700">Return to EchoMind</a>
  </main>
</body>
</html>"""
    return HTMLResponse(content=html, status_code=200)


@router.get("/profile", response_model=InstagramProfile)
def instagram_profile(user_id: str = Depends(require_user)) -> InstagramProfile:
    try:
        return read_profile(user_id)
    except Exception as exc:
        _raise_connector(exc)
        raise


@router.get("/media", response_model=list[InstagramMediaItem])
def instagram_media(
    limit: int = Query(default=10, ge=1, le=20),
    user_id: str = Depends(require_user),
) -> list[InstagramMediaItem]:
    try:
        return recent_media(user_id, limit)
    except Exception as exc:
        _raise_connector(exc)
        raise


@router.delete("")
def remove_connection(user_id: str = Depends(require_user)) -> dict[str, bool]:
    disconnect(user_id)
    return {"disconnected": True}
