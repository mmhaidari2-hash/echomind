from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_user
from app.schemas.life import (
    LifeEdge,
    LifeEdgeCreate,
    LifeNode,
    LifeNodeCreate,
    LifeSnapshot,
    Obligation,
    ObligationCreate,
    ObligationStatus,
    PromiseCreate,
    PromiseRecord,
    PromiseStatus,
)
from app.services.life import (
    add_edge,
    add_node,
    add_obligation,
    add_promise,
    list_edges,
    list_nodes,
    list_obligations,
    list_promises,
    set_obligation_status,
    set_promise_status,
    snapshot,
)

router = APIRouter(prefix="/life", tags=["life"])


@router.get("/snapshot", response_model=LifeSnapshot)
def life_snapshot(user_id: str = Depends(require_user)) -> LifeSnapshot:
    return snapshot(user_id)


@router.get("/nodes", response_model=list[LifeNode])
def nodes(user_id: str = Depends(require_user)) -> list[LifeNode]:
    return list_nodes(user_id)


@router.post("/nodes", response_model=LifeNode)
def create_node(payload: LifeNodeCreate, user_id: str = Depends(require_user)) -> LifeNode:
    return add_node(user_id, payload)


@router.get("/edges", response_model=list[LifeEdge])
def edges(user_id: str = Depends(require_user)) -> list[LifeEdge]:
    return list_edges(user_id)


@router.post("/edges", response_model=LifeEdge)
def create_edge(payload: LifeEdgeCreate, user_id: str = Depends(require_user)) -> LifeEdge:
    try:
        return add_edge(user_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/obligations", response_model=list[Obligation])
def obligations(
    include_closed: bool = Query(default=False),
    user_id: str = Depends(require_user),
) -> list[Obligation]:
    return list_obligations(user_id, include_closed=include_closed)


@router.post("/obligations", response_model=Obligation)
def create_obligation(payload: ObligationCreate, user_id: str = Depends(require_user)) -> Obligation:
    return add_obligation(user_id, payload)


@router.post("/obligations/{obligation_id}/status", response_model=Obligation)
def update_obligation(
    obligation_id: str,
    status: ObligationStatus,
    user_id: str = Depends(require_user),
) -> Obligation:
    try:
        return set_obligation_status(user_id, obligation_id, status)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/promises", response_model=list[PromiseRecord])
def promises(
    include_closed: bool = Query(default=False),
    user_id: str = Depends(require_user),
) -> list[PromiseRecord]:
    return list_promises(user_id, include_closed=include_closed)


@router.post("/promises", response_model=PromiseRecord)
def create_promise(payload: PromiseCreate, user_id: str = Depends(require_user)) -> PromiseRecord:
    return add_promise(user_id, payload)


@router.post("/promises/{promise_id}/status", response_model=PromiseRecord)
def update_promise(
    promise_id: str,
    status: PromiseStatus,
    user_id: str = Depends(require_user),
) -> PromiseRecord:
    try:
        return set_promise_status(user_id, promise_id, status)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
