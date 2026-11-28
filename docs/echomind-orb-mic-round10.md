# EchoMind — round 10: orb hold-to-talk restart (mic works, orb does not)

## The report

Mahdi tested the round-9 APK on his Samsung (2026-11-28 ~12:37 GMT) and
clarified: **the bottom composer mic now WORKS, and the golden orb
(دایره) still does NOT work.** Pressing the orb records but nothing ever
happens afterwards — no transcript, no answer, no action.

## Root cause — PROVEN: the orb restarts its own session on release

Both paths share one `useSpeechRecognition` hook instance (ChatInput's).
The mic calls `startListening()` / `stopListening()` directly. The orb
(HomeHub) dispatches window events `echomind-listen-request` /
`echomind-listen-stop-request`, which ChatInput funnels into the same hook.

The orb's `endOrbPress` **tap branch re-dispatched `LISTEN_REQUEST` on
pointerup** — it was meant only to flip the teacher line to "tap". So on
the tap that STOPS a session the sequence was:

1. pointerdown → `LISTEN_STOP_REQUEST` → hook stops the session, arms the
   700 ms harvest that turns the recorded audio into a transcript and
   auto-sends it.
2. pointerup (same tap) → `LISTEN_REQUEST` again → ChatInput's
   `startIfRequested` sees listening/starting already false and **starts a
   brand-new session**.
3. `start()` calls `clearHarvest()` (`frontend/src/app/hooks/
   useSpeechRecognition.ts:335`, also `:760` in the stop path) — the stop's
   harvest is cancelled and the transcript is reset. The utterance is
   lost: 0 articles, 0 transcribe POSTs, and the orb just keeps recording.

A second restart path (race, also observed): `onOrbClick` after a ≥600 ms
hold dispatched `LISTEN_REQUEST` when HomeHub's `listening` state had
already flipped false — the click arriving after the release re-started
the session the release had just stopped.

Knock-on damage: the zombie restarted session holds the MediaRecorder
(`busy`), so the mic's next start fails with "Voice input failed". The
mic has no equivalent restart path — which is why the mic works and the
orb does not.

### Evidence (focused probe `probe-round10b.mjs`, pre-fix run)

- One orb tap = TWO `echomind-listen-request` events.
- After the stop tap: 1 more listen-request + a 2nd `getUserMedia` + a 2nd
  `recorder-start`, no 2nd `recorder-stop`, still recording 2.5 s later.
- R3 (hold): a `click` → `echomind-listen-request` after the stop.
- R2 (mic after an orb session): mic start failed — the zombie session
  held the recorder.

Hit-testing ruled out the alternatives: the orb button IS the topmost
element at its centre, the ring SVGs are `pointer-events-none`, and
`LivingOrb` (Glass.tsx) is a plain div with no pointer handlers — the
presses reach HomeHub, they just restarted the session on release.

## The fix (3 files, staging only)

- `frontend/src/app/components/HomeHub.tsx` — `endOrbPress` tap branch
  (line ~281): no longer re-dispatches `LISTEN_REQUEST`; it only calls
  `setListenMode("tap")` and dispatches the new mode-only `LISTEN_MODE`
  event. `endOrbPress` now refreshes `orbPressHandledRef` on every
  release (line ~259) so the 600 ms click guard suppresses the
  post-release click. `onOrbClick` comment updated.
- `frontend/src/app/components/NativeShell.tsx` — NEW
  `LISTEN_MODE = "echomind-listen-mode"` (line 27). Mode-only; it never
  starts or stops a session.
- `frontend/src/app/components/ChatInput.tsx` — listens for `LISTEN_MODE`
  (lines ~462–483) and updates `listenModeRef` only. `endMicPress` now
  refreshes `micPressHandledRef` (line ~276) — the same latent long-hold
  click-restart existed on the mic path via `toggleListening`.

## Contributing finding (NOT the root cause, NOT changed)

After any voice session completes, `page.tsx` auto-scrolls `main` to the
bottom (`scrollTop = scrollHeight`, re-asserted after rAF + 350 ms; the
effect re-runs on `[messages]`), so the orb scrolls off-screen and is
unreachable without scrolling up after a reply. A wizard also opens from
pillar replies (`openParsedPillar` → `scrollToSurface()`). This is a real
UX wart on the phone, but it is not why the orb "does nothing" — the
restart above is. The scroll-to-bottom exists so the reply is visible;
changing it is a separate decision, not part of round 10.

## Verification (overlay `~/workspace/echomind/.verify-round10/`)

- `npx tsc --noEmit` — exit 0, 0 errors. (Run in the overlay: staging
  lacks `tsconfig.json`; bare `tsc` there prints help and exits 1.)
- `test-speech` — pass (incl. the round-9 proxy regression case).
- `test-server-transcription` — 23/23.
- `test-network` — 5/5.
- `test-open-app` — 45/45.
- `export:android` — exit 0; rebuilt `frontend/out/` contains
  `echomind-listen-mode`.
- Focused probe `probe-round10b.mjs` — **20/20**: R1 orb tap → exactly 1
  listen-request for the start tap, 0 after the stop, 1 getUserMedia,
  transcript auto-sent, exactly 1 transcribe POST, orb NOT recording 2.5 s
  after stop. R2 mic tap unchanged (transcript + 1 POST, no restart).
  R3 orb hold → 0 listen-requests after release (click race fixed),
  transcript + 1 POST.
- Full probe `probe-round10.mjs` — **56/56** (results in
  `probe10/probe-results.json`, `probe10b/probe-results.json`): T1 orb
  hold → transcribing notice, transcript "open instagram" auto-sent,
  Instagram opened (`com.instagram.android`), 1 transcribe POST. T2 mic
  tap → same. T3 orb tap → same. Case A (orb hold, server transcript) →
  Persian confirmation ««اینستاگرام» رو باز می‌کنم…» + launcher called.
  Case B (voice question) → visible chat answer. Case C (key missing) →
  truthful Gemini-key message, 1 transcribe attempt, nothing sent. Case D
  (mic denied) → truthful permission + Settings message, 0 calls. Case E
  (old server) → truthful server-old message, 1 call that 404'd.
- Both probes re-run cleanly against the final build (56/56, 20/20).

### Two probe-harness lessons (not app bugs)

1. **The probe export must be built with the mock URL baked:**
   `NEXT_PUBLIC_API_URL=http://127.0.0.1:18080/api/v1 npm run
   export:android`. Native + production candidate list is exactly
   `[configured]` (`services/api.ts` `candidateBases`), so without it
   `resolveApiBase` throws `no_api_configured` and transcribe never
   reaches the mock — the first round-10 probe runs showed 0 transcribe
   calls on BOTH paths for this reason alone. CI bakes the Railway URL
   for the real APK (android-apk.yml line 15), so the real build is
   unaffected.
2. **T3 needs the reply stream to settle first:** the T2 reply streams in
   over ~1 s and every `messages` change re-runs the auto-scroll effect,
   so scrolling the orb into view must wait until the last message text
   has been stable for 1 s — otherwise the stream re-scrolls the orb back
   off-screen before the tap (centre was y=-1203 in both failing runs).

## Honest limits

- Headless only (chrome-headless-shell via CDP, real touch events,
  fake MediaRecorder + getUserMedia, mock API). MediaRecorder on
  Mahdi's Samsung is the phone-test gate.
- Live transcription still needs the Gemini key; chat answers still need
  PR #2 merge + Gemini key. A transcribed "open Instagram" works without
  either (local action); a transcribed question only gets the
  always-answer fallback until those land.
- No push, no CI, no APK for round 10 — staging only, branch
  `doodombeh/echomind-next`, HEAD `b9aa432` + the 3 files above.
