from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_user
from app.schemas.memory import (
    ActiveContext,
    ContextTag,
    ContextTagCreate,
    ContextTagUpdate,
    MemoryFact,
    MemoryFactCreate,
    MemoryProfile,
    MemoryRecallRequest,
    MemoryRecallResponse,
    UserPreferences,
)
from app.services.memory_engine import (
    active_context,
    add_tag,
    get_profile,
    hints_for,
    list_facts,
    list_tags,
    recall,
    remember,
    remove_tag,
    replace_tags,
    update_preferences,
)

router = APIRouter(prefix="/memory", tags=["memory"])


@router.get("/facts", response_model=list[MemoryFact])
def facts(user_id: str = Depends(require_user)) -> list[MemoryFact]:
    return list_facts(user_id)


@router.post("/facts", response_model=MemoryFact)
def create_fact(payload: MemoryFactCreate, user_id: str = Depends(require_user)) -> MemoryFact:
    try:
        return remember(user_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/recall", response_model=MemoryRecallResponse)
def recall_facts(payload: MemoryRecallRequest, user_id: str = Depends(require_user)) -> MemoryRecallResponse:
    found = recall(user_id, payload.query, payload.limit)
    return MemoryRecallResponse(facts=found, hints=hints_for(user_id, payload.query, payload.limit))


@router.get("/profile", response_model=MemoryProfile)
def profile(user_id: str = Depends(require_user)) -> MemoryProfile:
    return get_profile(user_id)


@router.get("/preferences", response_model=UserPreferences)
def read_preferences(user_id: str = Depends(require_user)) -> UserPreferences:
    return get_profile(user_id).preferences


@router.put("/preferences", response_model=UserPreferences)
def write_preferences(payload: UserPreferences, user_id: str = Depends(require_user)) -> UserPreferences:
    return update_preferences(user_id, payload)


@router.get("/tags", response_model=list[ContextTag])
def read_tags(user_id: str = Depends(require_user)) -> list[ContextTag]:
    return list_tags(user_id)


@router.put("/tags", response_model=list[ContextTag])
def write_tags(payload: ContextTagUpdate, user_id: str = Depends(require_user)) -> list[ContextTag]:
    return replace_tags(user_id, [(item.label, item.active) for item in payload.tags])


@router.post("/tags", response_model=ContextTag)
def create_tag(payload: ContextTagCreate, user_id: str = Depends(require_user)) -> ContextTag:
    return add_tag(user_id, payload.label, payload.active)


@router.delete("/tags/{tag_id}")
def delete_tag(tag_id: str, user_id: str = Depends(require_user)) -> dict[str, bool]:
    if not remove_tag(user_id, tag_id):
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"deleted": True}


@router.get("/context", response_model=ActiveContext)
def context(
    query: str = Query(default="", max_length=800),
    conversation_id: str | None = Query(default=None, max_length=64),
    user_id: str = Depends(require_user),
) -> ActiveContext:
    return active_context(user_id, query, conversation_id)
