from uuid import uuid4

from fastapi import APIRouter, Depends

from app.auth import require_user
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.pillars import process_message

router = APIRouter(tags=["chat"])


def _run_chat(payload: ChatRequest, user_id: str) -> ChatResponse:
    conversation_id = payload.conversation_id or str(uuid4())
    return process_message(
        user_id=user_id,
        message=payload.message,
        locale=payload.locale,
        conversation_id=conversation_id,
        metadata=payload.metadata,
    )


@router.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest, user_id: str = Depends(require_user)) -> ChatResponse:
    return _run_chat(payload, user_id)


@router.post("/process", response_model=ChatResponse)
def process(payload: ChatRequest, user_id: str = Depends(require_user)) -> ChatResponse:
    return _run_chat(payload, user_id)
