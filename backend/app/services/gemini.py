"""Gemini client port. Routes must not import the vendor SDK directly."""

from __future__ import annotations

import logging

from app.config import settings

logger = logging.getLogger(__name__)


class GeminiNotConfiguredError(RuntimeError):
    """Raised when a generate call is attempted without a usable key."""


def is_configured() -> bool:
    return bool(settings.GEMINI_API_KEY.strip()) and settings.GEMINI_API_KEY.strip() not in {
        "your_gemini_api_key_here",
        "changeme",
    }


def model_name() -> str:
    return settings.GEMINI_MODEL


def readiness() -> dict[str, str | bool]:
    configured = is_configured()
    return {
        "configured": configured,
        "model": model_name(),
        "status": "ready" if configured else "unconfigured",
    }


def generate_text(prompt: str) -> str:
    """Fail closed until a later phase wires the vendor SDK."""
    if not is_configured():
        logger.warning("gemini.generate_text refused: API key is not configured")
        raise GeminiNotConfiguredError("GEMINI_API_KEY is not configured")
    logger.info("gemini.generate_text not yet bound to a vendor client")
    raise GeminiNotConfiguredError("Gemini generate is not enabled in this phase")


def generate_with_memory(prompt: str) -> dict[str, object]:
    """Inject a memory-aware Gemini Flash prompt. Generate stays fail-closed."""
    logger.info("gemini.memory_prompt_chars=%s model=%s", len(prompt), model_name())
    if not is_configured():
        return {
            "status": "unconfigured",
            "injected": True,
            "model": model_name(),
            "prompt_chars": len(prompt),
        }
    try:
        text = generate_text(prompt)
    except GeminiNotConfiguredError:
        return {
            "status": "unavailable",
            "injected": True,
            "model": model_name(),
            "prompt_chars": len(prompt),
        }
    return {
        "status": "ok",
        "injected": True,
        "model": model_name(),
        "prompt_chars": len(prompt),
        "text": text,
    }
