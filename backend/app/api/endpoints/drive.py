"""Drive connector endpoints: status, start, search, read.

Read-only. A file that cannot be read as text (image, PDF, sheet,
binary) returns 400 with the reason — never a guessed summary.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_user
from app.schemas.drive import DriveFile, DriveFileRead
from app.services import drive_connector
from app.services.google_connector import (
    ConnectorNotConfiguredError,
    ConnectorNotConnectedError,
    ConnectorPermissionError,
    ConnectorUpstreamError,
)

router = APIRouter(prefix="/connectors/drive", tags=["connectors"])


@router.get("/status")
def drive_status(user_id: str = Depends(require_user)) -> dict[str, object]:
    return drive_connector.status(user_id)


@router.post("/start")
def drive_start(user_id: str = Depends(require_user)) -> dict[str, str]:
    try:
        return {"authorization_url": drive_connector.begin(user_id)}
    except ConnectorNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/search", response_model=list[DriveFile])
def drive_search(
    q: str = Query(default="", max_length=500),
    limit: int = Query(default=10, ge=1, le=20),
    user_id: str = Depends(require_user),
) -> list[DriveFile]:
    try:
        return drive_connector.search_files(user_id, q, limit)
    except ConnectorNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ConnectorNotConnectedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ConnectorPermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ConnectorUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/files/{file_id}", response_model=DriveFileRead)
def drive_read(file_id: str, user_id: str = Depends(require_user)) -> DriveFileRead:
    try:
        return drive_connector.read_file(user_id, file_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ConnectorNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ConnectorNotConnectedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ConnectorPermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ConnectorUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
