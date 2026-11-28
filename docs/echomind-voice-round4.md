# EchoMind voice — round 4 (hold-to-talk)

Date: 2026-11-27. Staging only, branch `doodombeh/echomind-next`.
No push, no CI, no merge, no message to Mahdi — waiting for his «بفرست».

## What Mahdi reported (phone test of the round-3 APK, 2026-11-27 10:57 GMT)

Layout fixes held (hero, orb centred, cards, no black voids). The
microphone still does not work: all three screenshots show
"Voice input failed. Try again." — the 8s watchdog firing, i.e. the
native recognizer start never resolved and never called back.

His own words (dictated Persian): "همون مشکل هست... میگه کلیک کن
میتونی حرف بزنی رو دایره زرد کلیک میکنی حرف میزنی میخوای حرف بزنی
ولی stop نمیشه بعد کلیکش یه جوریه که اصلا مشخص نیست که کلیکش باید
عمیق باشه بعد کلیکش رنگش عوض بشه به نظر من وقتی میزنی قرمز بشه که
record میکنه وقتی که نمیزنی دوباره زرد بشه پایینم همین اصلا اون
میکروفونه کار نمیکنه" — the same problem is still there; it says tap
to talk, you tap the yellow circle and talk, but it doesn't stop; the
tap is unclear, it should be a DEEP press and its colour must change;
when you press it should turn RED to show it's recording, and when
you're not pressing it should be yellow again; same at the bottom —
that microphone doesn't work at all.

Two further defects in the same screenshots: the composer placeholder
still shows "Message Echo" (truncated), and the orbit shows 4, then 4,
then only 2 nodes around the orb.

## 1. Diagnosis — why the native recognizer hangs on his Samsung

All claims below are verified against the installed
`@capacitor-community/speech-recognition` v7.0.1 sources
(`frontend/node_modules/@capacitor-community/speech-recognition/
android/.../SpeechRecognition.java`) and the round-3 app code.

### The root cause: `start()` resolving means nothing

In `beginListening()` the plugin does, in order:

```java
speechRecognizer.cancel();
speechRecognizer.destroy();                 // line ~187
speechRecognizer = SpeechRecognizer.createSpeechRecognizer(...);  // ~191
speechRecognizer.startListening(intent);    // ~196
if (partialResults) { call.resolve(); }     // ~199
```

The JS promise resolves **as soon as `startListening()` is invoiced**,
not when listening begins. Only the `listeningState: "started"` event
(from `onBeginningOfSpeech`, line 245) proves the recognizer is alive.
Round 3 treated a resolved start as "listening" — a hung service left
the UI thinking it was listening until the 8s watchdog fired the
generic "Voice input failed. Try again."

### The two silent-death paths (JS hears nothing)

1. **Zombie bind.** `startListening()` returns but the recognition
   service never calls back — no `onReady`, no `onBeginningOfSpeech`,
   no `onError`. The bind to the service stalls. Prime suspect for the
   stall: `beginListening()` destroys and recreates the
   `SpeechRecognizer` on **every** start (lines 187–191).
2. **Dropped error.** `onError` fires after the call was already
   resolved, so the reject is dropped and NO "stopped" event is sent.

Both end in the watchdog. The screenshots show the generic
`speechUnknown` ("Voice input failed. Try again."), **not** the
`micDenied` notice — so a permission denial is NOT the observed cause
(a denial maps to `not-allowed` → "Microphone permission was denied.").

### Three more plugin traps round 3 fell into

- **`stop()` never resolves.** The plugin's `stop()` is
  `try { stopListening(); } catch { call.reject(...); }` — there is no
  `call.resolve()` on the success path. Awaiting it hangs forever.
  Callers must fire-and-forget it.
- **`release()` never stopped the recognizer.** It only removed the JS
  listeners, so a zombied session stayed hot and the next start could
  hit `ERROR_RECOGNIZER_BUSY` and hang again.
- **The second tap could not stop a hung start.** The hook had no
  generation token: `stop()` during a pending start did not cancel the
  pending start, so the late-resolving start left a live session with
  no UI state. The mic's toggle also used only `listening`, so tapping
  while `starting` restarted instead of stopping.

### The probe: is the Google recognition service even there?

`getSupportedLanguages()` broadcasts to the Google app
(`com.google.android.googlequicksearchbox`). If that app is
missing/disabled the broadcast never returns and the promise hangs —
so the new probe always runs it behind a 5s timeout, once, cached.
`available()` (`SpeechRecognizer.isRecognitionAvailable()`) is checked
first and fast; the full probe runs in the background on mount and is
used only to name the cause when a start stalls.

### What could NOT be verified without the device

- The actual `RECORD_AUDIO` grant state on his phone.
- Whether `SpeechRecognizer.isRecognitionAvailable()` is true there.
- Whether the Google app / recognition service is present and enabled.
- Whether fa-IR / en-GB is supported by the on-device service.
- Whether a popup `RecognizerIntent` works where the no-popup intent
  stalls (not tried — the no-popup path is the hands-free design).

## 2. Hold-to-talk — exactly as Mahdi specified

Both the golden orb AND the composer mic:

- **Press-and-hold starts listening.** While held the control is
  **RED** — red orb (`data-state="recording"`, red sphere + red ripple
  + red glow) and red mic medallion (`echomind-medallion-recording`,
  white icon, red expanding ring) — plus a clear label:
  "Recording — release to stop" / «در حال ضبط — برای توقف رها کنید».
- **Releasing stops and it goes back to GOLD/yellow immediately.**
- **A single quick tap also starts listening** (tap mode), with the
  mic / orb itself as the obvious red STOP affordance
  ("Listening… tap to stop").
- **Stopping ALWAYS works.** The hook has a generation token: every
  start/stop/release bumps it, and every async continuation (start
  resolving, the started-gate, the watchdog, the continuous restart)
  checks it and kills its own session when stale. A stop during a
  pending start cancels the pending start — the late-resolving start
  is released instead of leaving a live session. The stop request from
  the orb/widget is honoured unconditionally (round 3 only stopped
  `if (listening)`). The mic toggle stops while `starting`, not only
  while `listening` (round 3 restarted on a tap during start).
- **Never a state that looks listening but isn't, or is listening but
  can't be stopped.** A native start that resolves but never fires
  `listeningState: "started"` fails after 4s (started-gate) with a
  named error; the 8s watchdog remains as the backstop for a start
  that never resolves at all. A stop also commits the pending partial
  text immediately (a zombied session may never fire the "stopped"
  event that would commit it), guarded by a per-session committed flag
  so a late `onFinal` cannot duplicate it.

## 3. Real error reasons, in his language (FA + EN)

The generic "Voice input failed. Try again." is gone as the stall
message. New codes, mapped in `ChatInput.speechNotice`:

| Code | EN | FA |
|---|---|---|
| `stalled` | The phone's speech service didn't start. Try again — if it keeps failing, make sure the Google app is enabled. | سرویس گفتار گوشی شروع نشد. دوباره تلاش کنید — اگر باز هم نشد، مطمئن شوید برنامهٔ Google فعال است. |
| `service-missing` | No speech recognizer on this phone, and server transcription isn't set up yet — please type for now. | روی این گوشی تشخیص‌گفتار نیست و رونویسی سرور هم هنوز راه‌اندازی نشده — فعلاً تایپ کنید. |
| `not-allowed` | (improved) Microphone permission is off. Allow it in Settings → Apps → EchoMind → Permissions, then try again. | (improved) دسترسی به میکروفون خاموش است. در تنظیمات ← برنامه‌ها ← EchoMind ← دسترسی‌ها آن را روشن کنید و دوباره تلاش کنید. |

The stall code is chosen from the service probe: no service / Google
app missing or timing out → `service-missing`; the probe lists
languages and the current language is absent → `language-not-supported`;
otherwise → `stalled`. The mic's muted "voice unavailable" hint names
the missing service too, instead of the generic "not supported" line.
Always-answer holds: every failure is a visible message naming the
cause — never silence.

## 4. Server-side fallback — checked first, does NOT exist

`backend/app/api/endpoints/voice.py` + `backend/app/services/voice.py`
are **text-to-speech only** (Gemini TTS `/voice/speak`,
`/voice/readiness`). A backend grep for transcri/STT/audio found only
intent-pipeline comments ("spoken transcripts arrive as text"). There
is **no server transcription path** (upload audio → text), so no
fallback was wired in this round — building a whole new STT backend
was out of scope per the brief.

The exact gap, for a later round: a `POST /voice/transcribe` endpoint
(multipart audio → Gemini multimodal audio understanding, auth +
size limits, Phase 11 of the spec owns it) plus the app recording
audio on the device (MediaRecorder) and sending it when the native
recognizer is unavailable or stalls. The on-device failure message
already names the missing piece (`speechServiceMissing`).

## 5. Composer placeholder — why it still truncated, and the fix

Round 3's `min-w-0 flex-1` fix passed headless at 360px (field
200px, placeholder text 149px in the headless font). On Mahdi's phone
it still shows "Message Echo": device font rendering runs wider than
the headless fallback (Vazirmatn-first stack, and/or device font
scaling > 1x), so the same string needs more width than the field
has. The exact device width was not measurable without the phone.

Fix (all three, so the margin is real, not just headless):

- Layout: attach button 40px → 36px on phones, gaps 4px → 2px,
  container padding 16px → 12px, textarea padding 8px → 4px and
  16px → 15px text on phones (~18px freed).
- The placeholder itself shrinks to 14px below 380px
  (`#echomind-composer::placeholder`) — typed text stays 15/16px.
  At the simulated 1.3x device font scale the placeholder now fits
  (195px text vs 200px field headless; the 14px placeholder is ~181px
  at 1.3x — see verification).

## 6. Orbit nodes — diagnosis with evidence, and the fix

Pixel analysis of Mahdi's three round-3 screenshots (PIL brightness
sampling): painted nodes +33..+136 vs background, absent nodes
−19..+17. The same node (e.g. gmail) is painted in one shot and absent
in another, and the set changes with scroll position — so the nodes are
**not painted at all** (not dark, not clipped, not faded). The code
rendered all 8 unconditionally with no visibility logic.

Diagnosis: mobile-GPU compositing/rasterization failure — the nodes
were centred with `-translate-x-1/2 -translate-y-1/2` and the selected
one scaled to 110%, each a transform layer; the scroll-linked tick
ring rotated up to 120° with scroll (framer-motion `ringRotate` on
the SVG `<g>`), repainting on every scroll frame. Transformed layers
were mis-culled / not re-rasterized after scroll on the Samsung
WebView.

Fix: **zero transforms on the hub.** Nodes are now positioned with
`left: calc(x% - 28px); top: calc(y% - 28px)` (56px node → 28px half),
the selected node reads as selected through a static gold ring
(`.echomind-node-selected`, no scale), the orb button is centred with
margins (`marginLeft/Top: -75`, LivingOrb size 150) instead of
`-translate`, and the tick ring is static (the scroll-linked rotation
effect and `useMotionValue` are removed). Headless verification
confirms all 8 nodes painted, `transform: none`, inside the container,
at scroll top / mid / bottom (see §8).

## 7. What changed per file

- `frontend/src/services/speech.ts` — `probe()` (one-time, cached,
  5s timeout on the Google-app broadcast; returns available /
  permission / googleService / languages); `release()` stops the
  native recognizer FIRST (fire-and-forget) then removes listeners;
  `stop()` is fire-and-forget (the plugin's `stop()` never resolves);
  new error codes `stalled` / `service-missing`; header comment
  corrected (start() resolves when invoiced, not when listening
  begins) and the full round-4 diagnosis recorded.
- `frontend/src/app/hooks/useSpeechRecognition.ts` — generation token
  (stop during a pending start always wins); 4s started-gate after a
  resolved native start (→ `stalled` / `service-missing` /
  `language-not-supported` from the probe); 8s watchdog now reports
  `stalled` instead of `unknown`; one-time background service probe
  on mount (own instance, never released — release would kill a live
  session); `stop()` commits the pending partial once per session;
  late partials/finals from a killed session are ignored; the
  continuous restart is generation-guarded. Exposes `serviceProbe`.
- `frontend/src/app/lib/copy.ts` — `speechStalled`,
  `speechServiceMissing`, `recordingHold`, improved `micDenied` (with
  the Settings path), `orbListenHint` now hold-first ("Hold the orb
  to talk" / «برای صحبت، دایره را نگه دارید»), `orbHoldStop`.
- `frontend/src/app/components/ChatInput.tsx` — hold-to-talk on the
  mic (pointerdown starts, pointerup ≥300ms stops, quick tap = tap
  mode, keyboard click guard, `touch-none select-none`, context-menu
  prevention); red recording medallion + red ring while held/listening;
  notice shows `recordingHold` while held; `speechNotice` maps the new
  codes; the stop request is honoured unconditionally; toggle stops
  while starting; the voice-unavailable hint names a missing service;
  `echomind-listening` now carries `{ listening, mode }`; placeholder
  layout savings (smaller attach button, tighter gaps/padding,
  15px text on phones).
- `frontend/src/app/components/HomeHub.tsx` — hold-to-talk on the orb
  (same pointer protocol, red `recording` orb state, teacher line
  "Recording — release to stop" for holds / "Listening… tap the orb
  to stop" for taps); nodes transform-free with calc() margins and a
  static gold selected ring; orb centred with margins; tick ring
  static (scroll-linked rotation removed); `echomind-listening`
  listener reads `{ listening, mode }`.
- `frontend/src/app/components/Glass.tsx` — `OrbState` gains
  `"recording"` (red).
- `frontend/src/app/globals.css` — `.echomind-living-orb[data-state=
  "recording"]` (red sphere + red ripple), `.echomind-medallion-
  recording`, `.echomind-mic-ring-recording`,
  `.echomind-node-selected`, placeholder 14px below 380px, reduced-
  motion coverage for the new classes; stale "translate(-50%,-50%)"
  comment corrected.
- `frontend/scripts/test-speech.mjs` — 6 new cases: probe ok/cached,
  probe without `getSupportedLanguages`, probe timeout, probe with no
  plugin, `stop()` returns when the plugin's `stop()` never resolves,
  `release()` stops the recognizer before removing listeners.
- `docs/voice-stt.md` — corrected the wrong claim ("start() resolves
  as soon as listening begins") with the round-4 correction note, and
  documented the `stop()` / `beginListening()` / `getSupportedLanguages()`
  traps.

No backend changes. No changes to `NativeShell.tsx` (widget /
notification Speak dispatch is unchanged — it sends a tap-mode
request; the orb and mic are the stop controls), `AndroidManifest.xml`
(`RECORD_AUDIO` was already declared) or the plugin wiring
(`cap sync` in CI registers it; the plugin is in `package.json`).

## 8. Verification

All run in the verify overlay (repo `main` frontend + staging
overlaid, `frontend/src/app/api` removed):

- **Frontend tsc:** 0 errors.
- **`node scripts/test-speech.mjs`:** all cases pass (including the 6
  new round-4 cases).
- **`npm run export:android`:** exit 0, static export ready
  (5/5 pages). The built CSS contains `echomind-medallion-recording`,
  `echomind-node-selected`, `living-orb[data-state=recording]` (3x)
  and the `#echomind-composer::placeholder` rule.
- **Backend suite:** 260 passed (no backend changes — regression only).
- **Headless probe** (`/tmp/echomind-round4-probe.mjs`, CDP against
  chrome-headless-shell, served static export): **18/18 checks pass**
  at 360px and 411px:
  - Placeholder fits: "Message EchoMind…" 149px text vs 200px field
    at 360px (251px at 411px); at a simulated 1.3x font scale 195px
    vs 200px — fits, 5px headroom headless (the real placeholder is
    14px below 380px, ~181px at 1.3x — ~19px headroom).
  - All 8 nodes painted, `transform: none`, inside the container, at
    scroll top / mid / bottom.
  - Mic hold: pointerdown → red medallion; pointerup after a hold →
    back to gold. A focused re-check showed the notice during a hold
    is "Recording — release to stop" and it clears on release.
  - Orb hold: pointerdown → orb `data-state="recording"`; pointerup →
    back to `idle`.

## 9. What remains unverified — the phone test is the final gate

- The native recognizer path itself: headless has no Capacitor bridge,
  so the web fallback runs there (headless shell exposes
  `SpeechRecognition` as a constructor; a start stays `starting`
  until the watchdog). The 4s started-gate and the `stalled` /
  `service-missing` messages are verified only by code path + service
  tests, **not** by a live recognizer.
- Whether the zombie bind still occurs on his Samsung (if the service
  itself is broken, the gate will now fail fast with the real reason
  instead of hanging — but only the phone shows which reason).
- Whether the nodes stay painted on the real Samsung GPU (headless
  cannot reproduce the compositing failure; the transform-free code
  removes the known trigger).
- Whether the placeholder fits on his actual device font (headless
  font is narrower than the phone's; the 1.3x simulation is a proxy).
- The hold-to-talk feel (deep press, red while held, release stops)
  can only be judged by his hand.

## 10. Still needed from Mahdi (nothing new for the code)

- **The phone test** of this round (native recognizer, orb hold,
  bottom mic hold, scroll, nodes, placeholder).
- **Unchanged standing blockers:** the Gemini API key (chat cannot
  answer live without it), the Clerk publishable key (the APK has no
  sign-in), the MENTOR session cookie, and the merge of PR #2 (the
  backend on Railway is still the old version — `/chat/stream` and
  `/providers` 404 live). The server-transcription endpoint
  (`POST /voice/transcribe`) needs a decision + the Gemini key before
  it can be built.
