"""Voice endpoints: which spoken voice is available, and the audio.

GET /voice/readiness reports the providers (Gemini-TTS, Azure, ElevenLabs,
device) and which one is selected. POST /voice/speak returns WAV audio
from the selected cloud voice — or 503 when no cloud voice is
configured, in which case the frontend falls back to the device voice
(speechSynthesis). No key is ever sent to the client.

POST /voice/transcribe (round 9, Phase 11 backend STT) is the other
direction: the app records with MediaRecorder and sends the audio
here; Gemini transcribes it and the transcript comes back as JSON.
The native SpeechRecognizer has failed on Mahdi's Samsung across
rounds 3-8, so this endpoint is the voice path that does not depend
on it. Errors carry a machine `code` in the body (the client's
request() reads it) so the app can name the cause: gemini_key_missing
(503, the key is not set), transcribe_bad_audio (400, the recording
itself), gemini_unavailable / gemini_key_invalid (503, the provider).
Audio is never stored — it lives only in memory for the request.
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from app.auth import require_user
from app.services.transcribe import (
    MAX_AUDIO_BYTES,
    TranscriptionUnavailableError,
    transcribe_audio,
)
from app.services.voice import VoiceUnavailableError, synthesize, voice_readiness

router = APIRouter(prefix="/voice", tags=["voice"])


class SpeakRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    locale: str = Field(default="en", pattern="^(en|fa)$")


@router.get("/readiness")
def readiness(user_id: str = Depends(require_user)) -> dict[str, object]:
    return voice_readiness()


@router.post("/speak")
def speak(payload: SpeakRequest, user_id: str = Depends(require_user)) -> Response:
    try:
        audio, mime = synthesize(payload.text, payload.locale)
    except VoiceUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Response(content=audio, media_type=mime)


@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    locale: str = Form(default="en"),
    user_id: str = Depends(require_user),
) -> JSONResponse:
    if locale not in ("en", "fa"):
        return JSONResponse(
            status_code=400,
            content={"detail": "locale must be en or fa", "code": "transcribe_bad_audio"},
        )
    # Read at most one byte over the cap so an oversized upload is
    # rejected by the service instead of being buffered in full.
    data = await audio.read(MAX_AUDIO_BYTES + 1)
    try:
        transcript = transcribe_audio(data, audio.content_type or "", locale)
    except TranscriptionUnavailableError as exc:
        status = 503 if exc.code != "transcribe_bad_audio" else 400
        return JSONResponse(
            status_code=status,
            content={"detail": str(exc), "code": exc.code},
        )
    return JSONResponse(content={"transcript": transcript, "locale": locale})

