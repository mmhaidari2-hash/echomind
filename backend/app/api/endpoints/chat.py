from uuid import uuid4

from fastapi import APIRouter

from app.schemas.chat import ChatRequest, ChatResponse
from app.services.pillars import process_message

router = APIRouter(tags=["chat"])


def _run_chat(payload: ChatRequest) -> ChatResponse:
    conversation_id = payload.conversation_id or str(uuid4())
    return process_message(
        message=payload.message,
        locale=payload.locale,
        conversation_id=conversation_id,
        metadata=payload.metadata,
    )


@router.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    return _run_chat(payload)


@router.post("/process", response_model=ChatResponse)
def process(payload: ChatRequest) -> ChatResponse:
    return _run_chat(payload)
