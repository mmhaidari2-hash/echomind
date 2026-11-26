"""Mail endpoints: archive search, archive deep-scan, snooze,
unanswered-mail chase, and in-thread replies.

Read-only calls fail truthfully when Google is not connected (409)
instead of returning an empty list — the app must never pretend
"nothing found" when it could not look. Snoozing creates an
obligation; replying sends an email, so both go through the same
owner-scoped auth as the rest of the Life Graph.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_user
from app.schemas.connectors import GmailMessageSummary
from app.schemas.detection import DetectionScanResult
from app.schemas.mail import SnoozeCreate, SnoozeRecord, UnansweredThread
from app.services import detection as detection_service
from app.services import mail as mail_service
from app.services.google_connector import (
    ConnectorNotConfiguredError,
    ConnectorNotConnectedError,
    ConnectorPermissionError,
    ConnectorUpstreamError,
    reply_gmail,
    search_gmail,
)

router = APIRouter(prefix="/life/mail", tags=["life"])


def _map_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ConnectorNotConfiguredError):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, ConnectorNotConnectedError):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, ConnectorPermissionError):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, ConnectorUpstreamError):
        return HTTPException(status_code=502, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


@router.get("/search", response_model=list[GmailMessageSummary])
def search_mail(
    q: str = Query(default="", max_length=500),
    limit: int = Query(default=20, ge=1, le=50),
    user_id: str = Depends(require_user),
) -> list[GmailMessageSummary]:
    """Search the whole Gmail archive (Gmail query syntax)."""
    try:
        return search_gmail(user_id, q, limit)
    except Exception as exc:
        raise _map_error(exc) from exc


@router.post("/scan-archive", response_model=DetectionScanResult)
def scan_archive(
    payload: dict[str, object],
    user_id: str = Depends(require_user),
) -> DetectionScanResult:
    """Run the Inbox Watch detectors over archive matches for a query."""
    query = payload.get("query") if isinstance(payload.get("query"), str) else ""
    limit = payload.get("limit") if isinstance(payload.get("limit"), int) else 20
    try:
        return detection_service.scan_archive(user_id, query, limit=limit)
    except Exception as exc:
        raise _map_error(exc) from exc


@router.post("/snooze", response_model=SnoozeRecord)
def snooze(payload: SnoozeCreate, user_id: str = Depends(require_user)) -> SnoozeRecord:
    """Park an email; it resurfaces as an obligation on snooze_until."""
    try:
        return mail_service.snooze_email(user_id, payload)
    except Exception as exc:
        raise _map_error(exc) from exc


@router.get("/snoozes", response_model=list[SnoozeRecord])
def list_snoozes(user_id: str = Depends(require_user)) -> list[SnoozeRecord]:
    return mail_service.list_snoozes(user_id)


@router.post("/snoozes/{snooze_id}/cancel", response_model=SnoozeRecord)
def cancel_snooze(snooze_id: str, user_id: str = Depends(require_user)) -> SnoozeRecord:
    try:
        return mail_service.cancel_snooze(user_id, snooze_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/unanswered", response_model=list[UnansweredThread])
def unanswered(
    days: int = Query(default=3, ge=1, le=90),
    limit: int = Query(default=20, ge=1, le=20),
    locale: str = Query(default="en", pattern="^(en|fa)$"),
    user_id: str = Depends(require_user),
) -> list[UnansweredThread]:
    """Sent emails with no reply within ``days``, each with a draft."""
    try:
        return mail_service.find_unanswered(user_id, days=days, limit=limit, locale=locale)
    except Exception as exc:
        raise _map_error(exc) from exc


@router.post("/{message_id}/reply", response_model=dict[str, object])
def reply(
    message_id: str,
    payload: dict[str, object],
    user_id: str = Depends(require_user),
) -> dict[str, object]:
    """Reply in the same thread as ``message_id``. Sends an email —
    the caller is the owner confirming the reply."""
    body = payload.get("body") if isinstance(payload.get("body"), str) else ""
    if not body.strip():
        raise HTTPException(status_code=400, detail="Reply body is required")
    locale = payload.get("locale") if isinstance(payload.get("locale"), str) else "en"
    try:
        return reply_gmail(user_id, message_id, body, locale=locale)
    except Exception as exc:
        raise _map_error(exc) from exc
