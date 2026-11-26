"""Spoken Persian: which voice can actually speak, and how.

The honest state of Persian voices in 2026 (researched 2026-11-26, see
docs/persian.md):
- Gemini-TTS lists fa-IR in preview with 30 voices (Kore, Aoede, Charon,
  Puck, ...) and detects the language automatically. It rides the SAME
  Gemini API key the chat already needs — one key unlocks both
  understanding and a natural voice.
- Azure has exactly two named Persian neural voices,
  fa-IR-DilaraNeural and fa-IR-FaridNeural (free tier 0.5M chars/month).
- ElevenLabs v3/v4 lists Persian and is the most natural in independent
  tests; paid-leaning.
- Google Cloud TTS (standard catalog) has NO Persian voice at all.
- The phone's built-in speechSynthesis fa-IR is what the app uses
  today: it works with no key, and its quality is whatever the device
  ships — which is why it can sound artificial.

This module implements the provider selection and the Gemini-TTS call
(the one that shares Mahdi's key). Azure and ElevenLabs are reported in
readiness as researched alternatives, not implemented — they need their
own keys and wiring, and this module never pretends otherwise. When no
cloud voice is configured, synthesis fails closed with a clear error
and the frontend falls back to the device voice.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import struct
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.config import settings
from app.services.gemini import is_configured as gemini_configured

logger = logging.getLogger(__name__)

_TTS_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"
_TTS_MODEL = "gemini-2.5-flash-preview-tts"
_TTS_VOICE = os.environ.get("GEMINI_TTS_VOICE", "Kore")
_SAMPLE_RATE = 24000
_TIMEOUT_SECONDS = 20


class VoiceUnavailableError(RuntimeError):
    """Raised when no natural voice can be produced for this request."""


def voice_readiness() -> dict[str, object]:
    gemini = gemini_configured()
    azure = bool(os.environ.get("AZURE_SPEECH_KEY", "").strip() and os.environ.get("AZURE_SPEECH_REGION", "").strip())
    elevenlabs = bool(os.environ.get("ELEVENLABS_API_KEY", "").strip())
    providers = [
        {
            "id": "gemini_tts",
            "configured": gemini,
            "implemented": True,
            "note": "Gemini-TTS, fa-IR in preview, 30 voices. Same key as chat." if gemini else "Needs Mahdi's Gemini API key (same key as chat).",
        },
        {
            "id": "azure",
            "configured": azure,
            "implemented": False,
            "note": "fa-IR-DilaraNeural (female) and fa-IR-FaridNeural (male). Needs an Azure Speech key + region and provider wiring.",
        },
        {
            "id": "elevenlabs",
            "configured": elevenlabs,
            "implemented": False,
            "note": "Persian on v3/v4 models, most natural in tests. Needs an ElevenLabs key and provider wiring.",
        },
        {
            "id": "browser",
            "configured": True,
            "implemented": True,
            "note": "Device speechSynthesis (fa-IR). Works with no key; quality depends on the phone.",
        },
    ]
    selected = "gemini_tts" if gemini else "browser"
    return {"providers": providers, "selected": selected}


def build_tts_request(text: str, voice: str = _TTS_VOICE) -> dict[str, object]:
    return {
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}},
        },
    }


def parse_tts_response(payload: object) -> bytes:
    if not isinstance(payload, dict):
        raise VoiceUnavailableError("Gemini-TTS returned an invalid response")
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise VoiceUnavailableError("Gemini-TTS returned no candidate")
    parts = candidates[0].get("content", {}).get("parts", []) if isinstance(candidates[0], dict) else []
    for part in parts:
        inline = part.get("inlineData") if isinstance(part, dict) else None
        if isinstance(inline, dict) and isinstance(inline.get("data"), str):
            try:
                return base64.b64decode(inline["data"])
            except Exception as exc:
                raise VoiceUnavailableError("Gemini-TTS returned undecodable audio") from exc
    raise VoiceUnavailableError("Gemini-TTS returned no audio")


def pcm_to_wav(pcm: bytes, sample_rate: int = _SAMPLE_RATE) -> bytes:
    """Wrap raw 16-bit mono PCM in a WAV header so <audio> can play it."""
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + len(pcm),
        b"WAVE",
        b"fmt ",
        16,
        1,  # PCM
        1,  # mono
        sample_rate,
        sample_rate * 2,
        2,  # block align
        16,  # bits per sample
        b"data",
        len(pcm),
    )
    return header + pcm


def synthesize_gemini(text: str, voice: str = _TTS_VOICE, *, _urlopen=None) -> bytes:
    """Synthesize Persian (or English) speech via Gemini-TTS. Returns WAV bytes."""
    if not gemini_configured():
        raise VoiceUnavailableError("Gemini-TTS is not configured: Mahdi's Gemini API key is needed")
    opener = _urlopen or urlopen
    url = f"{_TTS_API_ROOT}/{quote(_TTS_MODEL, safe='-_.')}:generateContent?key={settings.GEMINI_API_KEY.strip()}"
    body = json.dumps(build_tts_request(text, voice)).encode("utf-8")
    request = Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with opener(request, timeout=_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise VoiceUnavailableError(f"Gemini-TTS request failed (HTTP {exc.code})") from exc
    except URLError as exc:
        raise VoiceUnavailableError("Gemini-TTS is unreachable") from exc
    pcm = parse_tts_response(payload)
    return pcm_to_wav(pcm)


def synthesize(text: str, locale: str = "en") -> tuple[bytes, str]:
    """Synthesize with the selected cloud provider. Raises when none is
    configured — the caller falls back to the device voice."""
    readiness = voice_readiness()
    if readiness["selected"] == "gemini_tts":
        return synthesize_gemini(text), "audio/wav"
    raise VoiceUnavailableError(
        "No natural voice is configured. Add Mahdi's Gemini API key for Gemini-TTS "
        "(fa-IR, preview), or wire Azure Dilara/Farid. The device voice is the fallback."
    )
