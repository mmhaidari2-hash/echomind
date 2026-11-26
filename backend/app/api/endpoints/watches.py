"""Scheduled watches endpoints.

Creating a watch never acts on anything. Evaluating one only produces
proposals. Accepting a proposal creates an obligation — the follow-up
draft travels in its notes and is only sent through the existing
gmail.send confirmation flow. Evaluating all watches is the entry
point a scheduled runner calls.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_user
from app.schemas.watches import (
    WatchCreate,
    WatchEvaluateResult,
    WatchProposal,
    WatchRecord,
)
from app.services import watches as watches_service

router = APIRouter(prefix="/watches", tags=["watches"])


@router.post("", response_model=WatchRecord)
def create_watch(payload: WatchCreate, user_id: str = Depends(require_user)) -> WatchRecord:
    try:
        return watches_service.create_watch(user_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("", response_model=list[WatchRecord])
def list_watches(user_id: str = Depends(require_user)) -> list[WatchRecord]:
    return watches_service.list_watches(user_id)


@router.get("/proposals/all", response_model=list[WatchProposal])
def list_all_proposals(user_id: str = Depends(require_user)) -> list[WatchProposal]:
    return watches_service.list_proposals(user_id)


@router.get("/{watch_id}", response_model=WatchRecord)
def get_watch(watch_id: str, user_id: str = Depends(require_user)) -> WatchRecord:
    watch = watches_service.get_watch(user_id, watch_id)
    if watch is None:
        raise HTTPException(status_code=404, detail="Watch not found")
    return watch


@router.delete("/{watch_id}", response_model=dict[str, bool])
def delete_watch(watch_id: str, user_id: str = Depends(require_user)) -> dict[str, bool]:
    return {"deleted": watches_service.delete_watch(user_id, watch_id)}


@router.post("/{watch_id}/enable", response_model=WatchRecord)
def enable_watch(watch_id: str, user_id: str = Depends(require_user)) -> WatchRecord:
    try:
        return watches_service.set_watch_enabled(user_id, watch_id, True)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{watch_id}/disable", response_model=WatchRecord)
def disable_watch(watch_id: str, user_id: str = Depends(require_user)) -> WatchRecord:
    try:
        return watches_service.set_watch_enabled(user_id, watch_id, False)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{watch_id}/evaluate", response_model=WatchEvaluateResult)
def evaluate_watch(watch_id: str, user_id: str = Depends(require_user)) -> WatchEvaluateResult:
    try:
        return watches_service.evaluate_watch(user_id, watch_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        _map_connector_error(exc)


@router.post("/evaluate-all", response_model=list[WatchEvaluateResult])
def evaluate_all(user_id: str = Depends(require_user)) -> list[WatchEvaluateResult]:
    try:
        return watches_service.evaluate_all(user_id)
    except Exception as exc:
        _map_connector_error(exc)


@router.get("/{watch_id}/proposals", response_model=list[WatchProposal])
def list_proposals(watch_id: str, user_id: str = Depends(require_user)) -> list[WatchProposal]:
    if watches_service.get_watch(user_id, watch_id) is None:
        raise HTTPException(status_code=404, detail="Watch not found")
    return watches_service.list_proposals(user_id, watch_id)


@router.post("/proposals/{proposal_id}/accept", response_model=WatchProposal)
def accept_proposal(proposal_id: str, user_id: str = Depends(require_user)) -> WatchProposal:
    try:
        proposal, _item = watches_service.accept_proposal(user_id, proposal_id)
        return proposal
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/proposals/{proposal_id}/dismiss", response_model=WatchProposal)
def dismiss_proposal(proposal_id: str, user_id: str = Depends(require_user)) -> WatchProposal:
    try:
        return watches_service.dismiss_proposal(user_id, proposal_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _map_connector_error(exc: Exception) -> None:
    from app.services.google_connector import (
        ConnectorNotConfiguredError,
        ConnectorNotConnectedError,
        ConnectorPermissionError,
        ConnectorUpstreamError,
    )

    if isinstance(exc, ConnectorNotConfiguredError):
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if isinstance(exc, ConnectorNotConnectedError):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if isinstance(exc, ConnectorPermissionError):
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if isinstance(exc, ConnectorUpstreamError):
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    raise exc
