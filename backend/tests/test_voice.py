"""Voice tests: readiness, request building, WAV wrapping, fail-closed."""

import base64
import json
import struct

from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app
from app.services import voice as voice_service
from app.services.voice import VoiceUnavailableError

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def test_readiness_with_no_keys_selects_the_device_voice() -> None:
    readiness = voice_service.voice_readiness()
    assert readiness["selected"] == "browser"
    by_id = {item["id"]: item for item in readiness["providers"]}
    assert by_id["gemini_tts"]["configured"] is False
    assert by_id["azure"]["implemented"] is False
    assert by_id["elevenlabs"]["implemented"] is False
    assert by_id["browser"]["configured"] is True


def test_synthesize_without_a_key_fails_closed() -> None:
    try:
        voice_service.synthesize("سلام", "fa")
    except VoiceUnavailableError as exc:
        assert "Gemini" in str(exc) or "voice" in str(exc).lower()
    else:  # pragma: no cover - only when a key is present in the environment
        raise AssertionError("expected VoiceUnavailableError without a key")


def test_tts_request_shape() -> None:
    request = voice_service.build_tts_request("سلام دنیا")
    assert request["generationConfig"]["responseModalities"] == ["AUDIO"]
    assert request["generationConfig"]["speechConfig"]["voiceConfig"]["prebuiltVoiceConfig"]["voiceName"] == "Kore"
    assert request["contents"][0]["parts"][0]["text"] == "سلام دنیا"


def test_parse_tts_response_extracts_audio() -> None:
    pcm = b"\x00\x01\x02\x03"
    payload = {"candidates": [{"content": {"parts": [{"inlineData": {"data": base64.b64encode(pcm).decode()}}]}}]}
    assert voice_service.parse_tts_response(payload) == pcm
    try:
        voice_service.parse_tts_response({"candidates": []})
    except VoiceUnavailableError:
        pass
    else:  # pragma: no cover
        raise AssertionError("expected VoiceUnavailableError for an empty response")


def test_pcm_to_wav_has_a_valid_header() -> None:
    pcm = b"\x01\x02\x03\x04" * 100
    wav = voice_service.pcm_to_wav(pcm)
    assert wav[:4] == b"RIFF"
    assert wav[8:12] == b"WAVE"
    assert wav[12:16] == b"fmt "
    assert len(wav) == 44 + len(pcm)
    sample_rate = struct.unpack("<I", wav[24:28])[0]
    assert sample_rate == 24000


def test_speak_endpoint_is_503_without_a_key() -> None:
    _as("user-a")
    response = client.post("/api/v1/voice/speak", json={"text": "سلام", "locale": "fa"})
    assert response.status_code == 503


def test_readiness_endpoint_reports_providers() -> None:
    _as("user-a")
    response = client.get("/api/v1/voice/readiness")
    assert response.status_code == 200
    body = response.json()
    assert body["selected"] in {"browser", "gemini_tts"}
    assert {item["id"] for item in body["providers"]} == {"gemini_tts", "azure", "elevenlabs", "browser"}
