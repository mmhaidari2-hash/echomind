"""Provider registry endpoints: list, add, edit, delete, activate, test.

Keys are never returned: the slot only says whether one is stored.
Activating or testing a slot with no key (or no endpoint) is refused
with 409, never pretended to work.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_user
from app.schemas.providers import (
    ProviderCreate,
    ProviderSlot,
    ProviderTestResult,
    ProviderUpdate,
)
from app.services import providers as providers_service
from app.services.providers import (
    ProviderNotConfiguredError,
    ProviderNotReadyError,
    ProviderUpstreamError,
)

router = APIRouter(prefix="/providers", tags=["providers"])


def _raise(exc: Exception) -> None:
    if isinstance(exc, LookupError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, ValueError):
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if isinstance(exc, ProviderNotConfiguredError):
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if isinstance(exc, ProviderNotReadyError):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if isinstance(exc, ProviderUpstreamError):
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    raise exc


@router.get("", response_model=list[ProviderSlot])
def list_providers(user_id: str = Depends(require_user)) -> list[ProviderSlot]:
    return providers_service.list_providers(user_id)


@router.post("", response_model=ProviderSlot)
def create_provider(payload: ProviderCreate, user_id: str = Depends(require_user)) -> ProviderSlot:
    try:
        return providers_service.create_provider(user_id, payload)
    except Exception as exc:
        _raise(exc)
        raise


@router.get("/active", response_model=ProviderSlot | None)
def get_active_provider(user_id: str = Depends(require_user)) -> ProviderSlot | None:
    return providers_service.get_active(user_id)


@router.patch("/{slot_id}", response_model=ProviderSlot)
def update_provider(
    slot_id: str, payload: ProviderUpdate, user_id: str = Depends(require_user)
) -> ProviderSlot:
    try:
        return providers_service.update_provider(user_id, slot_id, payload)
    except Exception as exc:
        _raise(exc)
        raise


@router.delete("/{slot_id}")
def delete_provider(slot_id: str, user_id: str = Depends(require_user)) -> dict[str, bool]:
    try:
        providers_service.delete_provider(user_id, slot_id)
    except Exception as exc:
        _raise(exc)
        raise
    return {"deleted": True}


@router.post("/{slot_id}/activate", response_model=ProviderSlot)
def activate_provider(slot_id: str, user_id: str = Depends(require_user)) -> ProviderSlot:
    try:
        return providers_service.set_active(user_id, slot_id)
    except Exception as exc:
        _raise(exc)
        raise


@router.post("/{slot_id}/test", response_model=ProviderTestResult)
def test_provider(slot_id: str, user_id: str = Depends(require_user)) -> ProviderTestResult:
    try:
        return providers_service.test_provider(user_id, slot_id)
    except Exception as exc:
        _raise(exc)
        raise
