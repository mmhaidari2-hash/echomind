"""Voice endpoints: which spoken voice is available, and the audio.

GET /voice/readiness reports the providers (Gemini-TTS, Azure, ElevenLabs,
device) and which one is selected. POST /voice/speak returns WAV audio
from the selected cloud voice — or 503 when no cloud voice is
configured, in which case the frontend falls back to the device voice
(speechSynthesis). No key is ever sent to the client.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.auth import require_user
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
