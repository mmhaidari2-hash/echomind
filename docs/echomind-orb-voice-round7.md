# EchoMind round 7 — voice hears but does nothing + glass orb (staging)

Date: 2026-11-27. Branch: `doodombeh/echomind-next` (head `09e124a0`, round 6).
Status: **staged only — NOT pushed, NOT merged, no CI run.** Waiting for Mahdi's «بفرست».

Trigger: Mahdi tested the round-5 APK (delivered 22:40 GMT) and reported 22:44 GMT
(in Persian): press → red, it hears his voice, but it does nothing afterwards
(«میزنی رو قرمز میشه صداتو میشنوه ولی بازم هیچ کاری انجام نمیده»); the orb still
does not look like a glass sphere («قرار شد میزنی توی اون محفظه مثلا قرمز بشه
خوشگل بشه»); remove the lines around it, only the apps around it
(«خطای دورشو پاک کن مثلا فقط اپا دورش باشه»); he had sent a photo of how to make
it («من عکس برات فرستاده بودم که چطور درست کنی»).

The photo is the spec: `~/workspace/user/files/18112_24_qs19.jpg` (iPhone render).
His round-4 phone screenshots: `~/workspace/user/files/18240_2_zfi6.jpg` (red) and
`18238_3_srlt.jpg` (gold/idle).

Related docs: `docs/echomind-voice-round4.md`, `docs/echomind-voice-round5.md`,
`docs/echomind-network-round6.md`, `docs/always-answer.md`.

---

## Task A — why voice "hears but does nothing"

### The diagnosis (verified against code + plugin source)

The speech plugin is `@capacitor-community/speech-recognition` v7.0.1
(`frontend/node_modules/@capacitor-community/speech-recognition/android/.../SpeechRecognition.java`).
Its behaviour, read from the plugin source:

1. `start()` with `partialResults: true` resolves **immediately** (empty) — the
   final matches never come through the promise.
2. Final results arrive **only** as a `partialResults` event from `onResults` —
   which fires **after** `onEndOfSpeech` (the hook's `listeningState: "stopped"`).
   `onError` fires **no** "stopped" event at all.
3. The hook (`frontend/src/app/hooks/useSpeechRecognition.ts`) `stop()` bumps
   the generation token **first** (line 634), sets `listening=false`, commits
   only the last **interim** via `commitPendingText()` (line 644), then calls
   native `stop()` fire-and-forget. The late final `partialResults` event then
   arrives — and `onPartial`/`onFinal`/`onStopped` all ignore it (generation
   mismatch, lines 449/470/529/555). **The final text is dropped at the guard.**
4. Even the text `commitPendingText()` saved into hook `transcript` state never
   reaches the draft: `ChatInput.tsx`'s live-sync effect is guarded by
   `if (!listening) return;` (line 387) — and listening is already false after
   stop.
5. **Nothing auto-sends, ever.** The transcript could only become a message if
   the user manually tapped send. If no interim partials flowed (short
   utterance, or the service emits only `onResults`), the transcript was
   **entirely lost**.
6. The send path itself was fine: `page.tsx` `handleSend` appends the user
   message + pending bubble, tries `streamChat`, falls back to `sendChat`, and
   on any error maps to `answerForError` (truthful 404/503/phone_offline
   replies) — so once the transcript reaches `handleSend`, always-answer
   covers it. The voice path simply never reached `handleSend`.

What Mahdi saw on the phone matches this exactly: the orb turned red, the
"listening" notice showed, the interim draft appeared — and after release
nothing happened, because the final text died at the generation guard and
nothing ever auto-sent.

### The fix

**`frontend/src/services/speech.ts`**
- New exported pure helper `mergeLateFinal(base, committedPartial, late)`
  (line 119). Partials are prefixes, not deltas: when the late final starts
  with the already-committed interim, the committed prefix is **replaced**, not
  appended (otherwise "سلام سلام، ..." — a duplicated interim). Unrelated text
  is appended; an empty late returns the base.
- New service method `takeLastText()` (line 365): returns **and clears** the
  service's `lastText`, which is updated by **every** `partialResults` event —
  including the final `onResults` event. The hook harvests the finished
  utterance through this because it is **not** generation-guarded.

**`frontend/src/app/hooks/useSpeechRecognition.ts`**
- New option `onSessionEnd?: (text: string) => void` (line 109) — fires once
  per listen period that produced text.
- `FINAL_HARVEST_MS = 700` (line 117). `stop()` schedules a harvest timer
  (lines 664–677): it reads `takeLastText()`, merges it into `finalsRef` via
  `mergeLateFinal`, then calls `onSessionEnd(finalsRef.trim())`.
- `lastCommittedChunkRef` tracks the chunk committed for the current utterance;
  `onPartial`/`onFinal`/`commitPendingText` are all merge-aware, so the
  display never duplicates. `start()` clears the harvest and resets the chunk;
  `release()` clears the harvest; `onStopped` restart resets the chunk.
- The round-4 generation-bump guarantee is preserved: late events from a dead
  session are still ignored; the harvest goes through the unguarded
  `takeLastText()` path instead.

**`frontend/src/app/components/ChatInput.tsx`**
- New `handleVoiceSessionEnd` (line 287): the finished utterance becomes a
  **sent message** via `onSend({ text, attachments: [] })` — the always-answer
  path replies, or names the cause when the server cannot answer.
- Guards, so the auto-send never double-sends or fights the user:
  - Typed-submit suppression: `submit()` sets `suppressVoiceSendUntilRef`
    (line 621, 1500 ms window, ref at line 255). If the user tapped send while
    listening, the heard text stays as a draft — no second message.
  - `disabled` (page passes `disabled={sending}`, i.e. a send is in flight)
    → draft only.
  - Draft-ownership check via `lastSyncedRef` (what the live sync last wrote)
    vs the live textarea value: if the user typed during the harvest window,
    the heard text is appended to the draft instead of auto-sent.

**`frontend/scripts/test-speech.mjs`** — new round-7 cases: `takeLastText`
returns the late final after stop and clears on take (and a fresh start clears
it); 6 `mergeLateFinal` cases (extends → replaced; equals → unchanged;
unrelated → appended; empty late → base; empty base → late; already-tail →
unchanged).

No backend changes.

---

## Task B — orb + orbit, from the mockup

Mockup element by element (`18112_24_qs19.jpg`):

| Mockup element | Round 7 result |
|---|---|
| Large glossy 3D golden sphere, bright specular highlight top-left, deep gold shading at the bottom, soft rim light, real depth | Rebuilt (see below). Screenshots confirm the highlight + deep bottom shading + rim. |
| Smooth golden elliptical orbit rings, Saturn-style, crossing the orb | Added as SVG (see below). |
| No dashed circle, no straight spokes | Removed. Verified: 0 line elements, 0 dashed strokes in the orbit. |
| App nodes as glassy dark medallions with icons sitting on the rings | Unchanged — nodes stay at their existing positions as glassy dark medallions. |

**`frontend/src/app/globals.css`**
- Idle orb rebuilt as an **opaque glossy golden sphere**: pale gold-white
  specular top-left (`rgb(255 255 255 / 0.98)` at 31%/24%), saturated gold
  body `rgb(240 184 74)`, deep bronze bottom `rgb(118 70 14)`, bright inset
  rim, warm outer glow (lines 490–492). Round 5's translucency is gone — it
  read as a flat dark disc on the phone; nothing shows through the orb now.
- Recording: the **same glossy shell** (specular + rim kept), red core **small
  and central** — strong red to ~46% radius (`rgb(226 46 40)`), fading to dark
  glass at the rim — plus red pooling at the bottom and a red outer glow
  (line 570). The red reads as light **inside** the chamber, not a repaint.
  Round 5's core was 70% radius on a translucent body, which read as a flat
  red ball.

**`frontend/src/app/components/HomeHub.tsx`**
- **Removed:** the tick ring (24 ticks), the dashed circle
  (`strokeDasharray`), and the 8 straight spoke lines.
- **Added:** the mockup's smooth golden elliptical rings as SVG — a back
  ellipse behind the orb (`<ellipse cx=50 cy=50 rx=47 ry=15 rotate(-18 50 50)>`,
  gold `linearGradient` `#f6d789 → #e5a93c → #9a6b1f`, 0.9 stroke + a
  2.4/0.16 glow duplicate) and a front arc in front of the orb's lower third
  (`<path d="M 4 54 A 46 12 -12 0 1 96 46">`, 1.4 stroke + 3/0.18 glow
  duplicate, `pointer-events-none`, placed between the orb button and the node
  buttons in DOM order). Lines 441–444, 466, 477, 517.
- `ORBIT_RADIUS` is still used by `nodePosition`; nodes keep their existing
  `calc()` positions. Header + orbit comments updated (no more
  "spokes"/"tick ring").
- **Follow-up note:** if Mahdi wants the elliptical rings gone too, it is a
  one-line follow-up — the rings are the only lines left by design.

`Glass.tsx` `LivingOrb` is unchanged (plain div, CSS does the work). The
composer mic medallion `.echomind-medallion-recording` is unchanged.

---

## Verification (overlay `~/workspace/echomind/.verify-round7/`)

- `npx tsc --noEmit`: **0 errors**.
- `node scripts/test-speech.mjs`: **all cases pass** (incl. the new round-7
  cases). `node scripts/test-network.mjs`: **5/5**.
- `npm run export:android` (with `NEXT_PUBLIC_API_URL=http://127.0.0.1:18080/api/v1`,
  after `rm -rf frontend/src/app/api` per the CI step): **exit 0**, static
  export ready.
- Headless probe `probe-round7.mjs` (chrome-headless-shell, CDP; mock API on
  127.0.0.1:18080 = stream 404 / chat 503; static export on 18081; `fa`
  locale; a fake `SpeechRecognition` injected before page scripts — interim
  "سلام" at 400 ms, final "سلام، حقوق مصرف‌کننده من چیست؟" delivered only on
  `stop()`, mimicking the native plugin): **25/25 checks PASS** at 412×915
  and 360×800:
  - Voice: interim lands in the draft while holding; the transcript auto-sends
    with the **exact** final text (1007 ms); **no** "سلام سلام" duplication;
    the assistant answers truthfully («سرور الان شلوغ است...», 503); the reply
    scrolls into view; the chat reached the configured mock base only
    (`/api/v1/chat/stream`, `/api/v1/chat`).
  - Orb: idle opaque gold; recording red core with specular kept; back to gold
    after release; no spoke lines; no dashed circle; back ellipse (2) + front
    arc present; all 8 nodes painted at 412 **and** 360.
- Probe screenshots viewed by the agent:
  `probe7/shot-412-orb-idle.png`, `shot-412-orb-red.png`,
  `shot-360-orb-idle.png`, `shot-360-orb-red.png`, `shot-412-voice.png`.
  Idle: glossy gold sphere, highlight top-left, rings crossing it, 8 dark
  medallion nodes, no dashed circle, no spokes. Red: red core inside the
  glass chamber, highlight + rim kept, composer showing the interim "سلام"
  and the «در حال شنیدن...» notice.

### Probe artefacts found and fixed (not product bugs)

Two probe failures on the way to 25/25 were both probe artefacts, fixed in the
probe — the product code did not change for either:

1. **360px nodes "unpainted":** the `main` scroller keeps its scroll position
   across `Page.navigate` in headless Chrome (scroll restoration), so after the
   412 voice case scrolled to the reply, the 360 node centres were above the
   viewport and `elementFromPoint` returned nothing. Fix: the probe now
   scrolls `main` to top before measuring, and runs the ring/node checks
   before any orb press.
2. **Voice "api: (none)" + a 4 ms instant match:** chrome-headless-shell's
   default profile persists `localStorage` between launches, so run 2 matched
   run 1's saved thread instantly and never sent anything. Fix: the probe now
   launches Chrome with a fresh `--user-data-dir` per run and clears
   `echomind.thread.v1` in `loadApp()`.

---

## Honest limits — what only the phone can prove

- **The native plugin path cannot be verified headless.** The probe used a
  web-path fake that mimics the plugin's event order (final only on `stop()`).
  The real `@capacitor-community/speech-recognition` behaviour on Samsung
  WebView — whether it emits the late final at all, and whether the 700 ms
  harvest window catches it — is proven only by Mahdi holding the orb on his
  phone and seeing the message send.
- **A real voice answer still needs PR #2 merge + Railway redeploy + Gemini
  key.** The network fix (round 6) changes *which truthful message* shows; it
  does not make the server answer. Until then the voice path answers with the
  truthful "server busy / not configured" message — never silence — but it is
  not a real answer.
- **The round-5 node fix is still unproven on the phone.** The headless probe
  paints all 8 nodes at 412 and 360, but the missing Drive/Docs/Sheets/Bank
  on his phone was a Samsung WebView raster issue, not reproducible headless.
  If the 4 are still missing on his phone, the next step is structural
  (in-flow grid / SVG nodes), not another class tweak.
- **The orb is judged by his eye, not the screenshots.** The headless renders
  match the mockup's elements (highlight, deep bottom, rim, rings, red core
  inside), but his phone's screen, scale and the real glass look are the gate.
  If he wants the rings gone too, that is a one-line follow-up.
