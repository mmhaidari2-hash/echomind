from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_user
from app.schemas.connectors import (
    YouTubeChannel,
    YouTubeConnectStart,
    YouTubeConnectorStatus,
    YouTubeVideo,
)
from app.services.youtube_connector import (
    ConnectorNotConfiguredError,
    ConnectorNotConnectedError,
    ConnectorPermissionError,
    ConnectorUpstreamError,
    begin,
    channel as read_channel,
    recent_videos,
    status,
)

router = APIRouter(prefix="/connectors/youtube", tags=["connectors"])


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


@router.get("/status", response_model=YouTubeConnectorStatus)
def youtube_status(user_id: str = Depends(require_user)) -> YouTubeConnectorStatus:
    return YouTubeConnectorStatus(**status(user_id))


@router.post("/start", response_model=YouTubeConnectStart)
def start(user_id: str = Depends(require_user)) -> YouTubeConnectStart:
    try:
        return YouTubeConnectStart(authorization_url=begin(user_id))
    except Exception as exc:
        _raise_connector(exc)
        raise


@router.get("/channel", response_model=YouTubeChannel)
def youtube_channel(user_id: str = Depends(require_user)) -> YouTubeChannel:
    try:
        return read_channel(user_id)
    except Exception as exc:
        _raise_connector(exc)
        raise


@router.get("/videos", response_model=list[YouTubeVideo])
def youtube_videos(
    limit: int = Query(default=10, ge=1, le=20),
    user_id: str = Depends(require_user),
) -> list[YouTubeVideo]:
    try:
        return recent_videos(user_id, limit)
    except Exception as exc:
        _raise_connector(exc)
        raise
