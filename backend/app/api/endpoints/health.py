from fastapi import APIRouter

from app.services import gemini

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy"}


@router.get("/ready")
def ready() -> dict[str, object]:
    gemini_state = gemini.readiness()
    return {
        "status": "ready",
        "gemini": gemini_state,
    }
