import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.auth import require_user
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.gemini import GeminiUnavailableError, is_configured, stream_text
from app.services.memory_engine import build_personalized_prompt, record_turn
from app.services.pillars import classify_pillar, process_message

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


def _sse(event: str, payload: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/chat/stream")
def stream_chat(payload: ChatRequest, user_id: str = Depends(require_user)) -> StreamingResponse:
    if not is_configured():
        raise HTTPException(status_code=503, detail="Gemini is not configured")

    conversation_id = payload.conversation_id or str(uuid4())
    pillar = classify_pillar(user_id, payload.message, payload.metadata, conversation_id)
    prompt = build_personalized_prompt(
        user_id,
        payload.message,
        payload.locale,
        payload.metadata.memory_hints,
        conversation_id,
    )
    record_turn(user_id, conversation_id, "user", payload.message, pillar.value)

    def events():
        parts: list[str] = []
        yield _sse(
            "meta",
            {
                "conversation_id": conversation_id,
                "pillar": pillar.value,
            },
        )
        try:
            for chunk in stream_text(prompt):
                parts.append(chunk)
                yield _sse("delta", {"text": chunk})
        except GeminiUnavailableError:
            yield _sse("error", {"code": "gemini_unavailable", "message": "Gemini is temporarily unavailable"})
            return

        full_text = "".join(parts).strip()
        if full_text:
            record_turn(user_id, conversation_id, "assistant", full_text, pillar.value)
        yield _sse("done", {"conversation_id": conversation_id})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
