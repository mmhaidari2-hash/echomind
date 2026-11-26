"""Promise Chaser endpoints.

GET /life/promises/{id}/followups lists the deterministic follow-up steps
for one promise. POST .../followups/{step}/draft returns the chase email
draft for that step plus the Bounded Authority proposal that would send it.
Nothing is sent from here: the owner must propose and confirm it.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import require_user
from app.schemas.followup import FollowupDraftResponse, FollowupStep, FollowupStepKind
from app.services import followup as followup_service
from app.services.life import list_promises

router = APIRouter(prefix="/life/promises", tags=["life"])


class DraftRequest(BaseModel):
    to: str | None = Field(default=None, max_length=320)
    locale: str = Field(default="en", pattern="^(en|fa)$")


def _promise_or_404(user_id: str, promise_id: str):
    for item in list_promises(user_id, include_closed=True):
        if item.id == promise_id:
            return item
    raise HTTPException(status_code=404, detail="Promise not found")


@router.get("/{promise_id}/followups", response_model=list[FollowupStep])
def followups(promise_id: str, user_id: str = Depends(require_user)) -> list[FollowupStep]:
    promise = _promise_or_404(user_id, promise_id)
    return followup_service.followup_steps(promise)


@router.post("/{promise_id}/followups/{step}/draft", response_model=FollowupDraftResponse)
def draft(
    promise_id: str,
    step: FollowupStepKind,
    payload: DraftRequest,
    user_id: str = Depends(require_user),
) -> FollowupDraftResponse:
    promise = _promise_or_404(user_id, promise_id)
    if promise.status != "open":
        raise HTTPException(status_code=409, detail="Promise is no longer open")
    draft = followup_service.draft_followup(promise, step, to=payload.to, locale=payload.locale)
    return FollowupDraftResponse(
        promise_id=promise.id,
        step=step,
        draft=draft,
        authority_proposal={
            "tool": "gmail.send",
            "summary": draft.subject,
            "parameters": {"to": draft.to, "subject": draft.subject, "body": draft.body},
            "evidence_ids": list(promise.evidence_ids or []),
            "idempotency_key": f"followup:{promise.id}:{step.value}",
        },
    )
