# Voice input (STT): native speech on the phone, Web Speech on the web

## The problem (verified in code, 2026-11-27)

Mahdi's core demand is hands-free voice: tap once (mic button, home-screen
widget, or the Speak notification action) and talk. All three entry points
funnel into `useSpeechRecognition` (`frontend/src/app/hooks/`), which used
**only** the Web Speech API — `window.SpeechRecognition` /
`window.webkitSpeechRecognition`, `fa-IR` / `en-GB`.

Android System WebView does **not** expose SpeechRecognition (it is a
Chrome-only API), so on his phone the mic showed the honest notice
"Voice input is not supported in this browser." (`copy.speechUnsupported`)
and did nothing. The failure was visible, not silent — but hands-free
voice was broken at the root. The in-app mic button, the widget deep link
(`echomind://assistant?listen=1`) and the notification Speak action all
hit the same dead end.

## The fix

- **Native on the phone:** `@capacitor-community/speech-recognition`
  v7.0.1 (peer `@capacitor/core >= 7`, matches the app's Capacitor 7.4.3),
  Android's `SpeechRecognizer`, language `fa-IR` / `en-GB`, `popup: false`
  (no Google dialog in the way — hands-free), `partialResults: true`
  (live text while talking). `RECORD_AUDIO` was already in the Android
  manifest; the plugin's own manifest declares it too.
- **Web Speech stays the web fallback.** The hook picks native when
  `isNativeApp()`, else Web Speech.
- **Same entry points, same pipeline:** the hook is the single start path
  for the mic button, the widget and the notification, so all three get
  the native path with no ChatInput changes. The transcript still mirrors
  into the composer live and goes through the same intent pipeline
  (including the always-answer guidance in `docs/always-answer.md`).

## Plugin behaviour (verified against the installed v7.0.1 sources)

- `start({ partialResults: true, popup: false })` resolves as soon as
  listening begins; results arrive as `partialResults` events (interim
  results AND the final matches) and `listeningState` `started` /
  `stopped` marks session ends.
- With partialResults on, a recognition error surfaces **only as a plain
  `stopped` event** (the start call was already resolved, so its
  rejection is lost). The hook therefore treats a session that ends with
  no text as "no speech", and stops after 3 empty sessions in a row
  instead of restarting the recognizer forever (e.g. no network).
- `checkPermissions` / `requestPermissions` cover `RECORD_AUDIO`. A
  denial is reported as `not-allowed` (with the Settings path in the
  existing notice), never silently swallowed.
- `available()` reports whether a recognition service exists on the
  device (the Google app on Samsung). If there is none, the hook falls
  through to Web Speech, which reports "unsupported" honestly in a
  WebView.

## Files

- `frontend/src/services/speech.ts` — the native engine
  (`createNativeSpeech`, `loadNativeSpeechPlugin`); dependency-injected
  like `photos.ts`, so it is testable in plain Node.
- `frontend/src/app/hooks/useSpeechRecognition.ts` — the hook: native
  first on native, Web Speech otherwise; continuous restart on session
  end (both engines); `supported` now reflects the native recognizer
  too.
- `frontend/package.json` / `package-lock.json` — the new dependency.
- `frontend/scripts/test-speech.mjs` — Node tests for the service
  (happy path, denied/prompt permission, unavailable recognizer,
  network error mapping, single listener registration on restart).

## What is NOT verified — phone test required

- The native recognizer has **not** run on a real phone here (no Android
  device in this environment; CI builds the APK but cannot listen).
  Phone test: install the new APK, tap the mic, speak Persian, confirm
  the words appear live and survive stopping; repeat from the widget and
  from the Speak notification; deny the mic permission once and confirm
  the `not-allowed` notice.
- `fa-IR` recognition itself needs the device's speech service (Google
  app) with Persian available; if the phone has no Persian voice data,
  Android may fall back or fail — the hook then reports the mapped
  error, it does not fake a transcript.
- Assumed Android ordering: after `stop()`, `onResults` (final matches)
  fires before `onEndOfSpeech`, so the final text is committed before
  the session is marked stopped. If a device reverses that order, the
  last words of an utterance could be lost — watch for it in the phone
  test.
- `npx cap sync android` must run after the install (CI does this in
  the APK workflow); the plugin's native code + manifest entries merge
  then.
