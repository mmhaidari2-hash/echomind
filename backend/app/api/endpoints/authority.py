from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_user
from app.schemas.authority import ActionConfirm, ActionProposal, ActionProposalCreate, AuditEvent
from app.services.authority import audit_events, cancel, confirm_and_execute, list_actions, propose

router = APIRouter(prefix="/authority", tags=["authority"])


@router.get("/actions", response_model=list[ActionProposal])
def actions(user_id: str = Depends(require_user)) -> list[ActionProposal]:
    return list_actions(user_id)


@router.post("/actions", response_model=ActionProposal)
def create_action(payload: ActionProposalCreate, user_id: str = Depends(require_user)) -> ActionProposal:
    try:
        return propose(user_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/actions/{action_id}/confirm", response_model=ActionProposal)
def confirm_action(
    action_id: str,
    payload: ActionConfirm,
    user_id: str = Depends(require_user),
) -> ActionProposal:
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="Explicit confirmation is required")
    try:
        return confirm_and_execute(user_id, action_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/actions/{action_id}/cancel", response_model=ActionProposal)
def cancel_action(action_id: str, user_id: str = Depends(require_user)) -> ActionProposal:
    try:
        return cancel(user_id, action_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/audit", response_model=list[AuditEvent])
def audit(user_id: str = Depends(require_user)) -> list[AuditEvent]:
    return audit_events(user_id)
