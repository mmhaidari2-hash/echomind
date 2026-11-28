"""Server transcription tests: Gemini call shape, fail-closed key
handling, and the /voice/transcribe endpoint contract.

The Gemini HTTP call is faked (a stub urlopen); the endpoint success
case monkeypatches the service function, the way the endpoint's own
contract is tested — the wire format is covered by the unit tests.
"""

import base64
import io
import json
from urllib.error import HTTPError

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.services import transcribe as transcribe_service
from app.services.transcribe import TranscriptionUnavailableError

client = TestClient(app)

_FAKE_AUDIO = b"\x1a\x45\xdf\xa3" + b"\x00" * 100  # webm magic + padding


class _FakeResponse:
    def __init__(self, payload: dict):
        self._body = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _gemini_ok(transcript: str):
    def _open(request, timeout=None):
        payload = {
            "candidates": [
                {"content": {"parts": [{"text": transcript}]}}
            ]
        }
        return _FakeResponse(payload)

    return _open


def _gemini_http_error(code: int):
    def _open(request, timeout=None):
        raise HTTPError(request.full_url, code, "error", hdrs=None, fp=io.BytesIO(b"{}"))

    return _open


@pytest.fixture(autouse=True)
def _key(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(settings, "GEMINI_MODEL", "gemini-2.0-flash")
    yield


def test_transcribe_request_shape() -> None:
    request = transcribe_service.build_transcribe_request(
        base64.b64encode(_FAKE_AUDIO).decode("ascii"), "audio/webm"
    )
    part = request["contents"][0]["parts"][0]
    assert part["inlineData"]["mimeType"] == "audio/webm"
    assert base64.b64decode(part["inlineData"]["data"]) == _FAKE_AUDIO
    assert "Transcribe" in request["contents"][0]["parts"][1]["text"]
    assert request["generationConfig"]["temperature"] == 0


def test_extract_transcript_joins_parts_and_allows_empty() -> None:
    payload = {
        "candidates": [
            {"content": {"parts": [{"text": "سلام"}, {"text": " دنیا"}]}}
        ]
    }
    assert transcribe_service.extract_transcript(payload) == "سلام دنیا"
    assert transcribe_service.extract_transcript({"candidates": []}) == ""
    assert transcribe_service.extract_transcript({"candidates": [{"content": {"parts": []}}]}) == ""


def test_transcribe_audio_returns_the_transcript() -> None:
    text = transcribe_service.transcribe_audio(
        _FAKE_AUDIO, "audio/webm;codecs=opus", "fa", _urlopen=_gemini_ok("سلام دنیا")
    )
    assert text == "سلام دنیا"


def test_transcribe_audio_without_a_key_fails_closed(monkeypatch) -> None:
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    with pytest.raises(TranscriptionUnavailableError) as excinfo:
        transcribe_service.transcribe_audio(_FAKE_AUDIO, "audio/webm", "fa")
    assert excinfo.value.code == "gemini_key_missing"


def test_transcribe_audio_rejects_bad_input() -> None:
    with pytest.raises(TranscriptionUnavailableError) as excinfo:
        transcribe_service.transcribe_audio(b"", "audio/webm", "fa")
    assert excinfo.value.code == "transcribe_bad_audio"
    with pytest.raises(TranscriptionUnavailableError) as excinfo:
        transcribe_service.transcribe_audio(_FAKE_AUDIO, "audio/x-unknown", "fa")
    assert excinfo.value.code == "transcribe_bad_audio"
    with pytest.raises(TranscriptionUnavailableError) as excinfo:
        transcribe_service.transcribe_audio(
            b"x" * (transcribe_service.MAX_AUDIO_BYTES + 1), "audio/webm", "fa"
        )
    assert excinfo.value.code == "transcribe_bad_audio"


def test_transcribe_audio_maps_provider_errors() -> None:
    with pytest.raises(TranscriptionUnavailableError) as excinfo:
        transcribe_service.transcribe_audio(
            _FAKE_AUDIO, "audio/webm", "fa", _urlopen=_gemini_http_error(400)
        )
    assert excinfo.value.code == "transcribe_bad_audio"
    with pytest.raises(TranscriptionUnavailableError) as excinfo:
        transcribe_service.transcribe_audio(
            _FAKE_AUDIO, "audio/webm", "fa", _urlopen=_gemini_http_error(401)
        )
    assert excinfo.value.code == "gemini_key_invalid"
    with pytest.raises(TranscriptionUnavailableError) as excinfo:
        transcribe_service.transcribe_audio(
            _FAKE_AUDIO, "audio/webm", "fa", _urlopen=_gemini_http_error(503)
        )
    assert excinfo.value.code == "gemini_unavailable"


def test_transcribe_endpoint_is_503_without_a_key(monkeypatch) -> None:
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    response = client.post(
        "/api/v1/voice/transcribe",
        files={"audio": ("voice.webm", _FAKE_AUDIO, "audio/webm")},
        data={"locale": "fa"},
    )
    assert response.status_code == 503
    assert response.json()["code"] == "gemini_key_missing"


def test_transcribe_endpoint_rejects_a_bad_locale() -> None:
    response = client.post(
        "/api/v1/voice/transcribe",
        files={"audio": ("voice.webm", _FAKE_AUDIO, "audio/webm")},
        data={"locale": "de"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "transcribe_bad_audio"


def test_transcribe_endpoint_returns_the_transcript(monkeypatch) -> None:
    from app.api.endpoints import voice as voice_endpoint

    monkeypatch.setattr(
        voice_endpoint, "transcribe_audio", lambda data, mime, locale: "سلام دنیا"
    )
    response = client.post(
        "/api/v1/voice/transcribe",
        files={"audio": ("voice.webm", _FAKE_AUDIO, "audio/webm")},
        data={"locale": "fa"},
    )
    assert response.status_code == 200
    assert response.json() == {"transcript": "سلام دنیا", "locale": "fa"}


def test_transcribe_endpoint_maps_a_bad_recording(monkeypatch) -> None:
    from app.api.endpoints import voice as voice_endpoint

    def _bad(data, mime, locale):
        raise TranscriptionUnavailableError(
            "The recording is empty", code="transcribe_bad_audio"
        )

    monkeypatch.setattr(voice_endpoint, "transcribe_audio", _bad)
    response = client.post(
        "/api/v1/voice/transcribe",
        files={"audio": ("voice.webm", b"", "audio/webm")},
        data={"locale": "fa"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "transcribe_bad_audio"
