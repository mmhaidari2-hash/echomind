"""Intent endpoint: understand a message before the LLM sees it.

POST /chat/understand runs the deterministic intent layer (Persian and
English, typed or spoken) and returns the intent, entities and action.
It never calls an LLM and never writes anything.
"""

from fastapi import APIRouter, Depends

from app.auth import require_user
from app.schemas.intent import IntentResult
from app.services.intent import understand
from pydantic import BaseModel, Field


class UnderstandRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)
    locale: str = Field(default="en", pattern="^(en|fa)$")


router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/understand", response_model=IntentResult)
def understand_message(payload: UnderstandRequest, user_id: str = Depends(require_user)) -> IntentResult:
    return understand(payload.text, payload.locale)
