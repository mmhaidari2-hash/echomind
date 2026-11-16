"""Gemini client port. Routes must not import vendor-specific clients directly."""

from __future__ import annotations

import json
import logging
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.config import settings

logger = logging.getLogger(__name__)

_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"
_TIMEOUT_SECONDS = 20


class GeminiNotConfiguredError(RuntimeError):
    """Raised when a generate call is attempted without a usable key."""


class GeminiUnavailableError(RuntimeError):
    """Raised when Gemini cannot return a usable response."""


def is_configured() -> bool:
    return bool(settings.GEMINI_API_KEY.strip()) and settings.GEMINI_API_KEY.strip() not in {
        "your_gemini_api_key_here",
        "changeme",
    }


def model_name() -> str:
    return settings.GEMINI_MODEL.strip()


def readiness() -> dict[str, str | bool]:
    configured = is_configured()
    return {
        "configured": configured,
        "model": model_name(),
        "status": "ready" if configured else "unconfigured",
    }


def _endpoint() -> str:
    model = quote(model_name(), safe="-_.")
    return f"{_API_ROOT}/{model}:generateContent"


def _extract_text(payload: object) -> str:
    if not isinstance(payload, dict):
        raise GeminiUnavailableError("Gemini returned an invalid response")
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise GeminiUnavailableError("Gemini returned no candidate")
    first = candidates[0]
    if not isinstance(first, dict):
        raise GeminiUnavailableError("Gemini returned an invalid candidate")
    content = first.get("content")
    if not isinstance(content, dict):
        raise GeminiUnavailableError("Gemini returned no content")
    parts = content.get("parts")
    if not isinstance(parts, list):
        raise GeminiUnavailableError("Gemini returned no text parts")
    texts = [
        part.get("text", "")
        for part in parts
        if isinstance(part, dict) and isinstance(part.get("text"), str)
    ]
    text = "".join(texts).strip()
    if not text:
        raise GeminiUnavailableError("Gemini returned an empty response")
    return text


def generate_text(prompt: str) -> str:
    """Generate server-side text without exposing the API key to clients."""
    if not is_configured():
        logger.warning("gemini.generate_text refused: API key is not configured")
        raise GeminiNotConfiguredError("GEMINI_API_KEY is not configured")

    body = json.dumps(
        {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt}],
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 1200,
            },
        }
    ).encode("utf-8")
    request = Request(
        _endpoint(),
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": settings.GEMINI_API_KEY.strip(),
        },
    )

    try:
        with urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        # Never include provider bodies because they can contain request details.
        logger.warning("gemini.http_error status=%s model=%s", exc.code, model_name())
        raise GeminiUnavailableError(f"Gemini request failed ({exc.code})") from exc
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        logger.warning("gemini.transport_error model=%s type=%s", model_name(), type(exc).__name__)
        raise GeminiUnavailableError("Gemini is temporarily unavailable") from exc

    return _extract_text(payload)


def generate_with_memory(prompt: str) -> dict[str, object]:
    """Generate from the owner-scoped memory-aware prompt, fail-closed on provider errors."""
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
    except (GeminiNotConfiguredError, GeminiUnavailableError):
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
