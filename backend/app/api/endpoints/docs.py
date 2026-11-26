"""Docs connector endpoints: status, start, search, read.

Read-only. A document's text comes from the Docs API (paragraphs
and table cells, in order), capped at 8,000 characters.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_user
from app.schemas.docs import DocRead
from app.schemas.drive import DriveFile
from app.services import docs_connector
from app.services.google_connector import (
    ConnectorNotConfiguredError,
    ConnectorNotConnectedError,
    ConnectorPermissionError,
    ConnectorUpstreamError,
)

router = APIRouter(prefix="/connectors/docs", tags=["connectors"])


@router.get("/status")
def docs_status(user_id: str = Depends(require_user)) -> dict[str, object]:
    return docs_connector.status(user_id)


@router.post("/start")
def docs_start(user_id: str = Depends(require_user)) -> dict[str, str]:
    try:
        return {"authorization_url": docs_connector.begin(user_id)}
    except ConnectorNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/search", response_model=list[DriveFile])
def docs_search(
    q: str = Query(default="", max_length=500),
    limit: int = Query(default=10, ge=1, le=20),
    user_id: str = Depends(require_user),
) -> list[DriveFile]:
    try:
        return docs_connector.search_documents(user_id, q, limit)
    except ConnectorNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ConnectorNotConnectedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ConnectorPermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ConnectorUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/documents/{document_id}", response_model=DocRead)
def docs_read(document_id: str, user_id: str = Depends(require_user)) -> DocRead:
    try:
        return docs_connector.read_document(user_id, document_id)
    except ConnectorNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ConnectorNotConnectedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ConnectorPermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ConnectorUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
