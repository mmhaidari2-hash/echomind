"""Server-side speech-to-text: turn a recorded utterance into text.

Phase 11 (ECHOMIND_MASTER_SPEC.md) owns backend STT. The native
SpeechRecognizer on Mahdi's Samsung has failed across rounds 3-8, so
the app records with MediaRecorder and this endpoint transcribes the
audio with Gemini multimodal audio instead — the on-device
recognition service is bypassed entirely.

Contract:
- POST /voice/transcribe (see api/endpoints/voice.py) sends the
  recorded audio bytes + locale; this module validates, calls Gemini
  generateContent with the audio as inlineData, and returns the
  transcript text ("" when the recording contains no speech — silence
  is a valid outcome, not an error).
- The Gemini key is the same one chat needs. Without it, fail closed
  with TranscriptionUnavailableError — never a fake transcript.
- Audio lives only in memory for the request: no file writes, and no
  audio content in logs (size + MIME only).
- Gemini's audio understanding accepts audio/webm (the format
  MediaRecorder produces on Android Chrome) alongside wav/mp3/aiff/
  aac/ogg/flac — see docs/echomind-server-transcription-round9.md.
"""

from __future__ import annotations

import base64
import json
import logging
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.config import settings
from app.services.gemini import is_configured as gemini_configured
from app.services.gemini import model_name

logger = logging.getLogger(__name__)

_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"
# Audio upload + transcription takes longer than a text chat call.
_TIMEOUT_SECONDS = 60
# Same 10 MiB cap as the image adapter: a hold-to-talk utterance is
# seconds of audio, far below this; anything larger is not a voice
# command.
MAX_AUDIO_BYTES = 10 * 1024 * 1024

# Gemini audio MIME types (docs: wav, mp3, aiff, aac, ogg, flac, m4a,
# opus, webm, ...). MediaRecorder on Android Chrome produces
# audio/webm;codecs=opus — parameters are stripped before the check.
ALLOWED_AUDIO_MIME_TYPES = frozenset(
    {
        "audio/webm",
        "audio/ogg",
        "audio/mp4",
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/x-wav",
        "audio/aac",
        "audio/x-aac",
        "audio/flac",
        "audio/m4a",
        "audio/mpga",
        "audio/opus",
        "audio/pcm",
    }
)

_TRANSCRIBE_PROMPT = (
    "Transcribe this audio exactly, word for word, in the language the "
    "speaker used (Persian/Farsi or English). Reply with ONLY the "
    "transcription — no introduction, no explanation, no quotation "
    "marks. If there is no speech in the audio, reply with an empty string."
)


class TranscriptionUnavailableError(RuntimeError):
    """Raised when a recording cannot be transcribed.

    `code` is the machine-readable reason the API layer maps to the
    response body (and the client maps to a visible message):
    - "gemini_key_missing": the Gemini key is not configured.
    - "gemini_key_invalid": the key was rejected by Gemini.
    - "gemini_unavailable": Gemini answered with a retryable failure
      or could not be reached.
    - "transcribe_bad_audio": the recording itself is the problem
      (empty, too large, unsupported format, or unreadable by Gemini).
    """

    def __init__(self, message: str, code: str = "gemini_unavailable") -> None:
        super().__init__(message)
        self.code = code


def normalize_mime_type(raw: str) -> str:
    """Strip parameters (e.g. ";codecs=opus") and lowercase."""
    return (raw or "").split(";", 1)[0].strip().lower()


def build_transcribe_request(audio_b64: str, mime_type: str) -> dict[str, object]:
    return {
        "contents": [
            {
                "parts": [
                    {"inlineData": {"mimeType": mime_type, "data": audio_b64}},
                    {"text": _TRANSCRIBE_PROMPT},
                ]
            }
        ],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 1024},
    }


def extract_transcript(payload: object) -> str:
    """Join the text parts of a generateContent response.

    Unlike the chat extractor, an empty result is NOT an error here:
    a recording with no speech transcribes to "" and the caller shows
    "no speech detected" instead of failing.
    """
    if not isinstance(payload, dict):
        raise TranscriptionUnavailableError(
            "Gemini returned an invalid response", code="gemini_unavailable"
        )
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return ""
    first = candidates[0]
    if not isinstance(first, dict):
        return ""
    content = first.get("content")
    if not isinstance(content, dict):
        return ""
    parts = content.get("parts")
    if not isinstance(parts, list):
        return ""
    texts = [
        part.get("text", "")
        for part in parts
        if isinstance(part, dict) and isinstance(part.get("text"), str)
    ]
    return "".join(texts).strip()


def transcribe_audio(
    audio: bytes,
    mime_type: str,
    locale: str = "en",
    *,
    _urlopen=None,
) -> str:
    """Transcribe recorded audio with Gemini. Returns the transcript
    (possibly ""). Raises TranscriptionUnavailableError — never a fake
    transcript — when the key is missing or the provider fails."""
    if not gemini_configured():
        raise TranscriptionUnavailableError(
            "Gemini API key is not configured: Mahdi's Gemini API key is "
            "needed for voice transcription (same key as chat)",
            code="gemini_key_missing",
        )
    if not audio:
        raise TranscriptionUnavailableError(
            "The recording is empty", code="transcribe_bad_audio"
        )
    if len(audio) > MAX_AUDIO_BYTES:
        raise TranscriptionUnavailableError(
            "The recording is too large (over 10 MB)",
            code="transcribe_bad_audio",
        )
    normalized_mime = normalize_mime_type(mime_type)
    if normalized_mime not in ALLOWED_AUDIO_MIME_TYPES:
        raise TranscriptionUnavailableError(
            f"Unsupported audio format: {normalized_mime or 'unknown'}",
            code="transcribe_bad_audio",
        )

    logger.info(
        "transcribe.request bytes=%s mime=%s locale=%s model=%s",
        len(audio),
        normalized_mime,
        locale,
        model_name(),
    )
    opener = _urlopen or urlopen
    url = f"{_API_ROOT}/{quote(model_name(), safe='-_.')}:generateContent"
    body = json.dumps(
        build_transcribe_request(base64.b64encode(audio).decode("ascii"), normalized_mime)
    ).encode("utf-8")
    request = Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": settings.GEMINI_API_KEY.strip(),
        },
    )
    try:
        with opener(request, timeout=_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        logger.warning("transcribe.http_error status=%s model=%s", exc.code, model_name())
        if exc.code == 400:
            raise TranscriptionUnavailableError(
                "Gemini could not read this recording",
                code="transcribe_bad_audio",
            ) from exc
        if exc.code in (401, 403):
            raise TranscriptionUnavailableError(
                "Gemini rejected the API key",
                code="gemini_key_invalid",
            ) from exc
        raise TranscriptionUnavailableError(
            "Gemini is temporarily unavailable",
            code="gemini_unavailable",
        ) from exc
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        logger.warning(
            "transcribe.transport_error model=%s type=%s", model_name(), type(exc).__name__
        )
        raise TranscriptionUnavailableError(
            "Gemini is temporarily unavailable", code="gemini_unavailable"
        ) from exc
    return extract_transcript(payload)
