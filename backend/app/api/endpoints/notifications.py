from fastapi import APIRouter, HTTPException, Query

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
def alerts(locale: str = Query(default="en", pattern="^(en|fa)$")) -> AlertBundle:
    return stored_bundle(locale)


@router.get("/watches", response_model=list[WatchRecord])
def watches() -> list[WatchRecord]:
    return list_watches()


@router.post("/watches", response_model=WatchRecord)
def create_watch(payload: WatchCreate) -> WatchRecord:
    return add_watch(payload)


@router.delete("/watches/{watch_id}")
def remove_watch(watch_id: str) -> dict[str, bool]:
    if not delete_watch(watch_id):
        raise HTTPException(status_code=404, detail="Watch not found")
    return {"deleted": True}
