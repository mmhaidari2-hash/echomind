"""Inbox Watch scan endpoint.

GET /life/detect runs the Gmail detectors and returns proposals. It never
creates, changes or deletes anything: it is a read-only scan. If Google is
not connected the failure is reported truthfully (409) instead of an empty
list, so the app never pretends "nothing found" when it could not look.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_user
from app.schemas.detection import DetectionScanResult
from app.services import detection as detection_service
from app.services.google_connector import (
    ConnectorNotConfiguredError,
    ConnectorNotConnectedError,
    ConnectorPermissionError,
    ConnectorUpstreamError,
)

router = APIRouter(prefix="/life/detect", tags=["life"])


@router.get("", response_model=DetectionScanResult)
def detect(
    limit: int = Query(default=20, ge=1, le=20),
    user_id: str = Depends(require_user),
) -> DetectionScanResult:
    try:
        return detection_service.scan_inbox(user_id, limit=limit)
    except ConnectorNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ConnectorNotConnectedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ConnectorPermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ConnectorUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/{proposal_id}/dismiss", response_model=dict[str, bool])
def dismiss(proposal_id: str, user_id: str = Depends(require_user)) -> dict[str, bool]:
    detection_service.dismiss_proposal(user_id, proposal_id)
    return {"dismissed": True}
