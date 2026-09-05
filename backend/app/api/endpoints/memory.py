from fastapi import APIRouter, HTTPException, Query

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
def facts() -> list[MemoryFact]:
    return list_facts()


@router.post("/facts", response_model=MemoryFact)
def create_fact(payload: MemoryFactCreate) -> MemoryFact:
    try:
        return remember(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/recall", response_model=MemoryRecallResponse)
def recall_facts(payload: MemoryRecallRequest) -> MemoryRecallResponse:
    found = recall(payload.query, payload.limit)
    return MemoryRecallResponse(facts=found, hints=hints_for(payload.query, payload.limit))


@router.get("/profile", response_model=MemoryProfile)
def profile() -> MemoryProfile:
    return get_profile()


@router.get("/preferences", response_model=UserPreferences)
def read_preferences() -> UserPreferences:
    return get_profile().preferences


@router.put("/preferences", response_model=UserPreferences)
def write_preferences(payload: UserPreferences) -> UserPreferences:
    return update_preferences(payload)


@router.get("/tags", response_model=list[ContextTag])
def read_tags() -> list[ContextTag]:
    return list_tags()


@router.put("/tags", response_model=list[ContextTag])
def write_tags(payload: ContextTagUpdate) -> list[ContextTag]:
    return replace_tags([(item.label, item.active) for item in payload.tags])


@router.post("/tags", response_model=ContextTag)
def create_tag(payload: ContextTagCreate) -> ContextTag:
    return add_tag(payload.label, payload.active)


@router.delete("/tags/{tag_id}")
def delete_tag(tag_id: str) -> dict[str, bool]:
    if not remove_tag(tag_id):
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"deleted": True}


@router.get("/context", response_model=ActiveContext)
def context(
    query: str = Query(default="", max_length=800),
    conversation_id: str | None = Query(default=None, max_length=64),
) -> ActiveContext:
    return active_context(query, conversation_id)
