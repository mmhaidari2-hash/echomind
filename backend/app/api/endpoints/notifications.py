from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_user
from app.schemas.notifications import AlertBundle, EvaluateRequest, WatchCreate, WatchRecord
from app.services.notifications import (
    add_watch,
    delete_watch,
    evaluate_request,
    list_watches,
    stored_bundle,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/evaluate", response_model=AlertBundle)
def evaluate(payload: EvaluateRequest) -> AlertBundle:
    return evaluate_request(payload)


@router.get("/alerts", response_model=AlertBundle)
def alerts(
    locale: str = Query(default="en", pattern="^(en|fa)$"),
    user_id: str = Depends(require_user),
) -> AlertBundle:
    return stored_bundle(user_id, locale)


@router.get("/watches", response_model=list[WatchRecord])
def watches(user_id: str = Depends(require_user)) -> list[WatchRecord]:
    return list_watches(user_id)


@router.post("/watches", response_model=WatchRecord)
def create_watch(payload: WatchCreate, user_id: str = Depends(require_user)) -> WatchRecord:
    return add_watch(user_id, payload)


@router.delete("/watches/{watch_id}")
def remove_watch(watch_id: str, user_id: str = Depends(require_user)) -> dict[str, bool]:
    if not delete_watch(user_id, watch_id):
        raise HTTPException(status_code=404, detail="Watch not found")
    return {"deleted": True}
