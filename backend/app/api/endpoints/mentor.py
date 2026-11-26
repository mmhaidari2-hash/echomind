"""MENTOR connection endpoints: status, session, task status.

MENTOR is Mahdi's command centre for all his projects. There
is no public JSON task API: EchoMind talks to MENTOR through
its owner-only dashboard form (POST /app/agents), which needs
the owner's MENTOR session cookie. The cookie is stored
encrypted server-side and is never returned — the connection
only reports whether one is stored and whether it still works.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_user
from app.schemas.mentor import MentorConnection, MentorSessionUpdate, MentorTaskStatus
from app.services import mentor as mentor_service
from app.services.mentor import (
    MentorNotConfiguredError,
    MentorNotReadyError,
    MentorUpstreamError,
)

router = APIRouter(prefix="/mentor", tags=["mentor"])


def _raise(exc: Exception) -> None:
    if isinstance(exc, MentorNotReadyError):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if isinstance(exc, MentorNotConfiguredError):
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if isinstance(exc, MentorUpstreamError):
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    raise exc


@router.get("/status", response_model=MentorConnection)
def mentor_status(user_id: str = Depends(require_user)) -> MentorConnection:
    return mentor_service.get_connection(user_id)


@router.post("/session", response_model=MentorConnection)
def save_mentor_session(payload: MentorSessionUpdate, user_id: str = Depends(require_user)) -> MentorConnection:
    try:
        return mentor_service.set_connection(
            user_id,
            endpoint=payload.endpoint,
            session_cookie=payload.session_cookie,
            cookie_name=payload.cookie_name,
            clear=payload.clear,
        )
    except Exception as exc:
        _raise(exc)
        raise


@router.get("/tasks/{task_id}/status", response_model=MentorTaskStatus)
def mentor_task_status(task_id: str, user_id: str = Depends(require_user)) -> MentorTaskStatus:
    try:
        return mentor_service.check_task_status(user_id, task_id)
    except Exception as exc:
        _raise(exc)
        raise
