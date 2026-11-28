# EchoMind — server-side voice transcription (round 9)

## What Mahdi asked for

Round 8 proved typed «open Instagram» opens Instagram on his phone.
But voice input still failed: pressing the top orb and the bottom
composer mic does nothing on his Samsung. The native speech
recognizer (@capacitor-community/speech-recognition) has now failed
on his phone across rounds 3–8, and the failure cannot be reproduced
or verified headless. Round 9 builds a path that does NOT depend on
the native recognizer at all: record audio in the app and transcribe
it on the server.

## What round 9 found (the real root cause)

The probe work for this round found the actual root cause of the
rounds 3–8 voice failures — it was NOT the microphone permission,
and it was NOT the recognizer service. It was a JavaScript trap in
`frontend/src/services/speech.ts`:

**A promise must never fulfill with a Capacitor plugin proxy.**
`ensurePlugin()` returned the load promise directly, and that
promise fulfilled with the plugin proxy object. Every
`await ensurePlugin()` (in `probe()` and in `start()`) hung
forever, because promise assimilation calls `proxy.then`, which
Capacitor routes to a non-existent native method. The browser
reports it as an uncaught rejection —
`"SpeechRecognition.then()" is not implemented on android` — and
the await never settles. The native start never ran; only the 8s
watchdog ever fired, which is exactly what Mahdi saw on his phone
("Voice input failed. Try again." / nothing happening).

Proven three ways:
- Minimal Node reproduction: awaiting a promise that fulfills with
  a Capacitor-like proxy hangs forever and emits the exact same
  unhandled rejection.
- Headless probe of the round-8 build: the same exception fires at
  app load (once per load, from the mount probe), and the orb hold
  never reaches `getUserMedia` — the mic log stays empty.
- Negative control: the new regression test in
  `test-speech.mjs` crashes with that exact error against the
  round-8 `speech.ts`, and passes against the fixed one.

The fix (in `speech.ts`): the conversion happens at the load
boundary. `loadNativeSpeechPlugin()` now fulfills with the plain
wrapper `{ plugin }` (built in a `.then()` callback on the module
import, which receives the proxy as a plain argument with no
assimilation). `ensurePlugin()` returns that wrapper promise, and
its four call sites unwrap with
`const { plugin: native } = await ensurePlugin();`. A plain wrapper
object is safe to await — assimilation only looks at the top-level
`.then`, never at nested properties.

**What this means for the phone:** with the fix, the native path
actually runs now instead of hanging — on Mahdi's phone the native
recognizer may now work for the first time. The server path below
remains as the fallback when the native recognizer cannot start,
and as the primary route when it fails. Both paths are verified
headless; the phone is still the final gate.

## The permission finding (checked first, as asked)

- `RECORD_AUDIO` **IS** declared in
  `frontend/android/app/src/main/AndroidManifest.xml`.
- The native plugin path **DOES** request it at runtime
  (`speech.ts`: check → request → `not-allowed`).
- For the server path the prompt comes from the WebView itself:
  Capacitor 7.6.9 `BridgeWebChromeClient.onPermissionRequest`
  handles `AUDIO_CAPTURE` by launching the runtime request for
  `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS` and granting the WebView
  resources on grant. `getUserMedia` IS the request — no manual
  request is needed, and none was added.
- The one permission wall that remains is a PERMANENT denial
  ("don't ask again"): `getUserMedia` then rejects
  `NotAllowedError` with no dialog. The service reports it as
  `not-allowed` and the UI shows the Settings path (micDenied).
  The native plugin hits the same wall the same way.

**Verdict: "the app never asks" is FALSE. The permission is NOT
the likely root cause of rounds 3–8.** The await-the-proxy hang
above is.

## Design

### Endpoint contract — `POST /api/v1/voice/transcribe`

- Multipart `audio` file + `locale` form field (`en` | `fa` only;
  anything else is 400 `transcribe_bad_audio`).
- Returns `{ transcript, locale }`. An empty transcript means the
  recording contained no speech — a valid outcome, not an error.
- Errors carry a machine `code` in the body (the client's
  `request()` reads it):
  - `gemini_key_missing` (503) — the Gemini key is not set. Fail
    closed, never a fake transcript.
  - `gemini_key_invalid` (503) — Gemini rejected the key.
  - `gemini_unavailable` (503) — Gemini failed or unreachable.
  - `transcribe_bad_audio` (400) — empty, oversized, or
    unsupported recording, or Gemini could not read it.
- Limits: 10 MiB max (same cap as the image adapter — a
  hold-to-talk utterance is seconds of audio); the endpoint reads
  at most MAX+1 bytes so an oversized upload is rejected without
  being buffered in full. Audio lives only in memory for the
  request — no file writes, no audio in logs (size + MIME only).
- Gemini multimodal audio via `generateContent` with the audio as
  `inlineData`, temperature 0, max 1024 output tokens, verbatim
  transcription in the speaker's language. Same key, header
  (`x-goog-api-key`) and model config as `stream_chat` /
  `voice.py`. 60s timeout.
- Audio format: MediaRecorder on Android Chrome produces
  `audio/webm;codecs=opus`. Gemini accepts `audio/webm` (verified
  against Google's audio-understanding docs: WAV, MP3, AIFF, AAC,
  OGG, FLAC, M4A, Opus, WebM). Parameters (`;codecs=opus`) are
  stripped before the allowlist check. The recorder tries
  `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4`,
  `audio/ogg;codecs=opus` in order and uses the first supported.
- Auth: `require_user`, like the other voice endpoints.

### Client — recording + fallback (`useSpeechRecognition.ts`)

- New service `frontend/src/services/serverTranscription.ts`
  (injectable, same pattern as `photos.ts` / `appLauncher.ts`):
  `createServerTranscription(deps)` with stub `getUserMedia`,
  `MediaRecorderClass`, `isTypeSupported`, `transcribe`. The real
  transcribe function is injected by the hook
  (`transcribeAudio` from `api.ts`), so the module has NO imports
  and stays compilable in a plain Node test. `start()` /
  `stop()` / `release()` / `transcribe()`; record reasons
  `not-allowed` / `no-mic` / `busy` / `unsupported` / `error` /
  `no-speech`; transcribe reasons `key-missing` / `server-old` /
  `server-busy` / `bad-audio` / `sign-in` / `offline` / `timeout` /
  `error`. A second `start()` while recording is `busy` (it used
  to silently abandon the first recorder and leak its stream).
- The hook keeps the native plugin path as-is and adds the server
  path as the fallback when the native one cannot start:
  - native start fails fast (`unsupported` / `unknown` /
    `network` / `stalled` / `service-missing`) → try the server
    session once per start attempt (one shared guard, so the
    started-gate and the watchdog cannot each launch a recording).
  - the native start resolves but the recognizer never begins
    listening (zombie bind, 4s gate) → server session.
  - the native start never resolves and never calls back (8s
    watchdog) → server session.
  - NOT retried: `not-allowed` (permission), `no-speech`,
    `audio-capture` — the server would hit the same wall.
  - A server attempt that already reported a cause (e.g. the
    microphone permission) is never overwritten by a later generic
    error — the `startWeb()` fallthrough and the gate/watchdog
    both check `shouldListenRef` first. (The first probe run
    caught the `startWeb()` overwrite: without the guard, a
    permission denial was replaced by a generic "unsupported".)
- `stop()` on a server session: stops the recorder, transcribes,
  and hands the finished utterance to `onSessionEnd` — the same
  round-7 `handleVoiceSessionEnd` the native path uses — so the
  transcript auto-sends and gets an answer exactly like a typed
  message. `transcribing` state blocks a new press until the
  transcription lands; `release()` releases the recorder too.
- `supported` is now true when the server recorder is available
  (MediaRecorder + getUserMedia), even with no on-device
  recognizer — otherwise the composer would wrongly call voice
  "not supported" on a phone whose recognizer is missing but
  whose microphone records fine.
- States shown: recording (red, as now), transcribing
  («در حال تبدیل صدا به متن…»), and a truthful message for every
  failure. New error codes in `speech.ts` (`key-missing`,
  `server-old`, `server-busy`, `bad-audio`, `sign-in`, `offline`,
  `timeout`) and new copy strings in `copy.ts` (FA + EN). The old
  `speechServiceMissing` line is updated: the endpoint now
  exists, so it only shows when BOTH the recognizer AND the
  server recorder cannot start.
- `frontend/src/services/api.ts`: `transcribeAudio(blob, locale)`
  — FormData with `audio` (filename by MIME) + `locale`, POST
  `/voice/transcribe`, auth "optional" like chat, 60s timeout.
  The endpoint error `code` is carried by `ApiError`.

## Per-file changes

| File | Change |
|---|---|
| `backend/app/services/transcribe.py` | NEW — Gemini multimodal transcription, limits, error codes |
| `backend/app/api/endpoints/voice.py` | NEW `POST /voice/transcribe` (multipart + locale, 503/400 mapping) |
| `backend/tests/test_transcribe.py` | NEW — 10 cases (see below) |
| `frontend/src/services/serverTranscription.ts` | NEW — MediaRecorder service + error mapping |
| `frontend/src/services/api.ts` | NEW `transcribeAudio()` |
| `frontend/src/app/hooks/useSpeechRecognition.ts` | Server fallback (fast-reject, started-gate, watchdog), server `stop()` branch, `transcribing` state, `supported` via MediaRecorder |
| `frontend/src/services/speech.ts` | **Await-the-proxy fix** (`ensurePlugin` wrapper + 4 call sites), new error codes, `loadNativeSpeechPlugin` fulfills with `{ plugin }` |
| `frontend/src/app/components/ChatInput.tsx` | `speechNotice` gains `transcribing` + new codes; `micRecording` includes transcribing |
| `frontend/src/app/lib/copy.ts` | NEW `transcribing` / `transcribeKeyMissing` / `transcribeServerOld` / `transcribeServerBusy` / `transcribeBadAudio` (FA+EN); `speechServiceMissing` updated |
| `frontend/scripts/test-server-transcription.mjs` | NEW — 23 Node cases |
| `frontend/scripts/test-speech.mjs` | NEW proxy regression case (round 9); all stubs now fulfill with `{ plugin }` |
| `docs/echomind-server-transcription-round9.md` | This doc |

## Verification (overlay `~/workspace/echomind/.verify-round9/`)

Built from the round-8 overlay (rsync `--link-dest`) + staging
rsync. Probe script `probe-round9.mjs` (overlay only, like
round 8).

- Backend: `pytest backend/tests/test_transcribe.py` — **10/10
  pass**. Full suite `pytest backend/tests/` — **126 passed, 0
  failed**.
- `npx tsc --noEmit` — **0 errors**.
- `node scripts/test-speech.mjs` — **pass** (incl. the new proxy
  regression case). `test-server-transcription.mjs` — **23/23
  pass**. `test-network.mjs` — **5/5 pass**. `test-open-app.mjs`
  — **45/45 pass**.
- `export:android` — **exit 0**.
- Headless probe `probe-round9.mjs` — **31/31 checks pass** at
  412px (fa locale, mock API, stub MediaRecorder + getUserMedia,
  native shell simulated):
  - **A — voice "open instagram":** hold orb → recording notice
    → `getUserMedia:ok` + `recorder-start:audio/webm;codecs=opus`
    → release → transcribing notice → transcript auto-sent as
    the exact user message → Persian confirmation
    («اینستاگرام» رو باز می‌کنم…) → launcher called with
    `com.instagram.android` → exactly one POST
    `/voice/transcribe`.
  - **B — voice question:** transcript auto-sent, visible chat
    answer appears, nothing launched.
  - **C — key missing (503 `gemini_key_missing`):** truthful
    "key needed" message, nothing sent.
  - **D — microphone denied:** truthful permission + Settings
    message, NO transcribe call, nothing sent.
  - **E — old server (404):** truthful "server is old" message,
    nothing sent.
  - Build checks: chunks call `/voice/transcribe` and reference
    `MediaRecorder`; `RECORD_AUDIO` declared; round-8 launcher
    wiring intact.
  - Screenshots viewed: recording (red orb, listening notice),
    voice-open (user bubble + confirmation), key-missing
    (truthful message).
- Negative control: the new proxy regression test **crashes with
  the exact trap error** against the round-8 `speech.ts` and
  passes against the fixed one.

## Honest limits — what only the phone + the Gemini key can prove

- **Live transcription CANNOT be proven without the Gemini key.**
  Every headless check uses a mocked endpoint. Until Mahdi sets
  `GEMINI_API_KEY` in Railway, the real Gemini call is untested.
- **The Railway backend is stale until PR #2 merges + redeploys.**
  The live server has no `/voice/transcribe` (and no
  `/chat/stream` / `/providers`). Until the merge + redeploy, the
  app gets the truthful "server is old" message — by design, not
  by accident.
- **MediaRecorder on his Samsung is the phone-test gate.** The
  headless recorder is a stub. Real behaviour — the WebView
  permission prompt, the actual webm bytes, recording while the
  app is backgrounded — only his phone proves.
- **The native path may now work too.** The proxy fix unblocks
  the native recognizer for the first time. If the native path
  works on his phone, voice works even before the server pieces
  land. If it still fails, the failure will now be a REAL,
  named error (not a hang) — and the server fallback takes over.
  Either outcome needs his phone test to confirm.
- **Chat answers still need PR #2 + the Gemini key.** A
  transcribed "open Instagram" works without either (local
  action). A transcribed question still gets only the
  always-answer fallback until the merge + key land.
- The probe runs in chrome-headless-shell, which HAS
  `webkitSpeechRecognition` (a real WebView has none) and NO
  `navigator.mediaDevices` (a real phone has it). Both are
  stubbed/handled in the probe; neither affects the app logic.
