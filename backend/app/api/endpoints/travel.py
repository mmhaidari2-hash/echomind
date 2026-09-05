from fastapi import APIRouter, HTTPException

from app.schemas.travel import TravelIntentRequest, TravelQuote
from app.services.travel import confirm_travel, quote_travel

router = APIRouter(prefix="/travel", tags=["travel"])


@router.post("/intent", response_model=TravelQuote)
def travel_intent(payload: TravelIntentRequest) -> TravelQuote:
    if payload.action == "confirm":
        if not payload.intent_id or not payload.confirm_token:
            raise HTTPException(status_code=400, detail="Confirmation requires a signed token")
        try:
            return confirm_travel(payload.intent_id, payload.confirm_token, payload.locale)
        except ValueError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc

    query = (payload.query or "").strip()
    if len(query) < 2:
        raise HTTPException(status_code=400, detail="Travel query is required")
    return quote_travel(query, payload.locale)
