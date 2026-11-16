from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_user
from app.schemas.conversations import ConversationDetail, ConversationSummary
from app.services.memory_engine import delete_conversation, recent_turns

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationSummary])
def list_conversations(user_id: str = Depends(require_user)) -> list[ConversationSummary]:
    turns = recent_turns(user_id, limit=80)
    grouped: dict[str, list] = {}
    for turn in turns:
        grouped.setdefault(turn.conversation_id, []).append(turn)
    rows: list[ConversationSummary] = []
    for conversation_id, items in grouped.items():
        first_user = next((item.text for item in items if item.role == "user"), "Conversation")
        rows.append(
            ConversationSummary(
                conversation_id=conversation_id,
                title=first_user[:80],
                message_count=len(items),
                updated_at=items[-1].created_at,
            )
        )
    return sorted(rows, key=lambda item: item.updated_at, reverse=True)


@router.get("/{conversation_id}", response_model=ConversationDetail)
def get_conversation(conversation_id: str, user_id: str = Depends(require_user)) -> ConversationDetail:
    turns = recent_turns(user_id, conversation_id=conversation_id, limit=80)
    if not turns:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationDetail(conversation_id=conversation_id, turns=turns)


@router.delete("/{conversation_id}")
def remove_conversation(conversation_id: str, user_id: str = Depends(require_user)) -> dict[str, bool]:
    if not delete_conversation(user_id, conversation_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"deleted": True}
