"""Sheets connector endpoints: status, start, search, tabs, read.

Read-only. Values are capped at 8,000 serialised characters; a
range that cannot be read returns the upstream reason, never a
guessed row.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_user
from app.schemas.drive import DriveFile
from app.schemas.sheets import SheetTab, SheetValues
from app.services import sheets_connector
from app.services.google_connector import (
    ConnectorNotConfiguredError,
    ConnectorNotConnectedError,
    ConnectorPermissionError,
    ConnectorUpstreamError,
)

router = APIRouter(prefix="/connectors/sheets", tags=["connectors"])


@router.get("/status")
def sheets_status(user_id: str = Depends(require_user)) -> dict[str, object]:
    return sheets_connector.status(user_id)


@router.post("/start")
def sheets_start(user_id: str = Depends(require_user)) -> dict[str, str]:
    try:
        return {"authorization_url": sheets_connector.begin(user_id)}
    except ConnectorNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/search", response_model=list[DriveFile])
def sheets_search(
    q: str = Query(default="", max_length=500),
    limit: int = Query(default=10, ge=1, le=20),
    user_id: str = Depends(require_user),
) -> list[DriveFile]:
    try:
        return sheets_connector.search_spreadsheets(user_id, q, limit)
    except ConnectorNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ConnectorNotConnectedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ConnectorPermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ConnectorUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/spreadsheets/{spreadsheet_id}/tabs", response_model=list[SheetTab])
def sheets_tabs(spreadsheet_id: str, user_id: str = Depends(require_user)) -> list[SheetTab]:
    try:
        return sheets_connector.list_tabs(user_id, spreadsheet_id)
    except ConnectorNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ConnectorNotConnectedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ConnectorPermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ConnectorUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/spreadsheets/{spreadsheet_id}", response_model=SheetValues)
def sheets_read(
    spreadsheet_id: str,
    range: str | None = Query(default=None, max_length=200),
    user_id: str = Depends(require_user),
) -> SheetValues:
    try:
        return sheets_connector.read_values(user_id, spreadsheet_id, range)
    except ConnectorNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ConnectorNotConnectedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ConnectorPermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ConnectorUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
