# EchoMind voice round 5 — glass orb, red from inside, nodes, chat

Staged only, on branch `doodombeh/echomind-next` (head `9d6d15b`, the round-4
commit). No push, no CI, no message to Mahdi. Built and verified in the
overlay `~/workspace/echomind/.verify-round5/` (repo main + this staging).

## What Mahdi reported (2026-11-27, 18:15 + 18:19 + 18:20 GMT)

He installed the NEW round-4 APK (confirmed 18:19 GMT) and the red DOES turn
red on press. The remaining failures are real failures on the round-4 build:

1. **A few apps disappear again.** Screenshots `18240_2_zfi6.jpg` (red /
   recording) and `18238_3_srlt.jpg` (gold / idle), both 18:19 GMT: only
   FOUR orbit nodes are visible in both states — Gmail (top), YouTube
   (upper-left), Calendar (upper-right), Instagram (left). MISSING: Drive,
   Docs, Sheets, Bank — the right-side and bottom positions. The dashed ring
   itself IS visible, and the spokes to the missing positions ARE visible.
   So the round-4 zero-transform fix did NOT hold on the device.
2. **Messages: a sent message does not go; a typed message goes but no
   reply ever comes.** In the screenshots the bubble
   «ادامه حقوق مصرف‌کننده» sits with no reply under it.
3. **The orb must be a glass sphere, red from inside.** The round-4 red orb
   is a solid flat red ball with a white highlight — the red is the whole
   surface, not red from inside. The gold orb is a glossy gold ball, also
   not glassy.
4. **Seventh time, same problem** (18:20 GMT): «میری کلی توکن مصرف میکنی میای
   درستش نمیکنی اگه نمیتونی بگو نمیتونم» — tokens burned, no fix; if you
   cannot, say you cannot. This doc says plainly what was verified, what
   the root cause is (with file/line evidence), and what could NOT be
   verified without the phone.

## Correction: the "typed message with no reply" is a suggestion chip

Read the screenshots against the code before believing them. The bubble
«ادامه حقوق مصرف‌کننده» under the label «ادامه از حافظه» is NOT a sent user
message:

- `ContextualSuggestions.tsx` renders the label from `dashText().contextTitle`
  (fa: «ادامه از حافظه») and, when the last message in the thread has pillar
  `consumer_rights`, the chip `continue-rights` with label
  «ادامه حقوق مصرف‌کننده» (`buildSuggestions`, `lastPillar ===
  "consumer_rights"`).
- The chip lives in `ChatInput`'s `leading` slot (`page.tsx`, `ChatInput.tsx`
  line ~588) — the fixed footer, always visible above the composer, while
  the real thread sits inside `main`, below the cards, scrolled out of view.
- Tapping the chip does NOT send a chat message: `onPick` for a pillar-only
  suggestion calls `openRightsWizard()` (`page.tsx` `onPick`). Before this
  round the wizard opened below the fold and main never scrolled to it, so
  the tap looked like nothing happened — the most likely reading of "I tap /
  send and nothing happens".
- The thread itself is non-empty (the chip only renders when a
  `consumer_rights` assistant reply exists in it), but its bubbles are below
  the fold in both screenshots. Whether his typed message and its reply are
  sitting unseen below the fold, or never arrived, cannot be told from these
  screenshots.

## 1. Orb — glass sphere, red from inside (DONE, verified headless)

`frontend/src/app/globals.css` — `.echomind-living-orb` (idle) and
`.echomind-living-orb[data-state="recording"]`, plus
`.echomind-medallion-recording` (composer mic). Hold-to-talk behaviour from
round 4 is unchanged (press = red/recording, release = gold/stop, tap = tap
mode with red STOP).

- **Idle (glass):** the body is translucent — the dark obsidian shows through
  the middle and darkens toward the rim (you can see the gold spokes THROUGH
  the ball in the probe screenshot), with a tight white specular top-left, a
  faint refracted highlight bottom-right, a soft warm gold heart, light
  pooling at the bottom (caustic), and a bright inset rim (light bending
  around the edge). The old opaque gold stack read as a flat glossy ball.
  Deliberate trade-off: the idle orb is darker and more transparent than the
  old solid gold ball — that is what glass means. If Mahdi wants it more
  golden, the one knob is the gold-heart opacity in the idle stack.
- **Recording (red from inside):** the glass shell is UNCHANGED — same
  specular, same rim, same translucent body — and a glowing red core is lit
  UNDER it (`radial-gradient(circle at 50% 58%, rgb(255 92 74 / 0.98) …,
  transparent 70%)`), with red light pooling at the bottom and a red outer
  glow. The ball reads as red light shining out of a glass sphere. The
  round-4 version swapped the whole background to opaque red, which is why
  it read as a flat red ball. Releasing returns to gold immediately (idle
  stack).
- **Composer mic:** same treatment — dark glass bevel base kept, red core
  under the specular, red rim/glow.

## 2. Orbit nodes — root cause NOT proven; hardening applied, phone gate stands

### What the device evidence shows

Missing on the round-4 build, in BOTH screenshots, deterministically: Drive
(0°, right), Docs (45°, lower-right), Sheets (90°, bottom), Bank (135°,
lower-left). Visible: Gmail (-90°, top), Calendar (-45°, upper-right),
Instagram (180°, left), YouTube (225°, upper-left). The ring and all 8 spokes
paint; the 4 node buttons do not. The discriminator is the container's
horizontal midline: everything strictly below it is missing, plus the
right-midline node.

### What was ruled out (file/line evidence)

- **Geometry:** `HomeHub.tsx` `nodePosition()` + `ANGLES =
  [-90, -45, 0, 45, 90, 135, 180, 225]`; nodes at
  `left: calc(x% - 28px), top: calc(y% - 28px)`, 56px buttons in a 340px
  `aspect-square` container. All 8 boxes are inside the container at 360px
  and 412px (verified in the DOM, see below). The top nodes sit at exactly
  the right orbit positions in Mahdi's screenshots, so `%` resolves against
  the container correctly.
- **States/badges:** all 8 states are `unknown` on the live backend (the
  connector status endpoints 404 there, `hubApps.ts loadHubStatuses`
  catches and leaves `unknown`), so no badge renders on any node; the
  visible dark nodes use the same `.echomind-medallion` class as the missing
  ones. Gmail is the only selected (gold) node. State cannot discriminate
  the missing four.
- **Icons:** `BrandIcon` cannot hide a node — the medallion background is on
  the `<button>` itself, and a failing icon would leave the dark circle.
  The missing positions show no circle, no rim, no icon at all.
- **Clipping/overflow:** the container is `overflow-visible` inside a
  `main.echomind-scroll` (`overflow-x: hidden; overflow-y: auto`); the
  container fits the content width at 360/412px, and the ring/spokes below
  the midline DO paint, so no ancestor clips the bottom half.
- **The `sending` guard / draft loss:** `ChatInput.tsx submit()` returns
  early on `!canSend` BEFORE clearing the draft, so a blocked send never
  swallows the message. The send button is `disabled` while `sending`, so a
  second tap during a send is ignored visibly (button dims), not silently.
- **Remote thread restore wiping the reply:** `page.tsx
  loadProtectedState` replaces the thread with remote turns — but it only
  runs on mount and on `echomind-auth-ready`, and that event is NEVER
  dispatched anywhere in `frontend/src` (only listened to). With no Clerk
  key the protected calls (`getMemoryProfile`, `getLifeSnapshot`,
  `getConversation` — all `auth: "protected"`) 401 and the restore never
  runs. Ruled out for Mahdi's signed-out build.
- **Backend auth:** the staging backend has no `app/auth.py` / `app/main.py`
  — the staging dir is a PARTIAL working copy (only branch-changed files),
  not a full tree. `backend/app/auth.py` exists on main
  (`~/workspace/echomind/repo/backend/app/auth.py`), so the branch inherits
  it; the overlay (main + staging) imports `chat.py` fine. No branch break.
  (Noted because the missing files look alarming in the staging dir.)

### What headless verification proved

Probe `~/workspace/echomind/.verify-round5/probe-round5.mjs` (headless
Chromium, CDP) against the static export, fa locale, seeded thread matching
Mahdi's state, mock backend mimicking the live one — at **412×915 and
360×800**:

- All 8 node buttons exist in the DOM with the correct `calc()` positions.
- `elementFromPoint` at each node's centre hits the button/icon itself
  (**PAINTED**) at scroll top, and at every partial-scroll position where
  the node is in the open viewport (scroll 200/400: the nodes still in view
  are PAINTED; the ones reported COVERED are sliding under the fixed header
  / offline banner, which is normal scrolling).
- Pixel sampling at 412px: node-centre brightness 57–211 vs background ~10
  (Gmail 101, Calendar 80, Drive 211, Docs 129, Sheets 166, Bank 124,
  Instagram 57, YouTube 158). All 8 painted.
- The SAME probe on the round-4 code (baseline run) also showed all 8
  painted. **The device failure could NOT be reproduced headlessly.**

### The remaining device-side hypotheses (unprovable in staging)

The node buttons were ALREADY maximally plain in round 4 — no transform, no
transition, no animation, no filter, no backdrop-filter, no will-change
(`HomeHub.tsx`, node button className). There is no class left to remove from
them. The failure is in the Samsung WebView's raster/compositing path, not in
the DOM/CSS as headless Chrome sees it. Candidates that cannot be
distinguished without the device: GPU tile culling of absolutely-positioned
children inside the nested scroller at some scroll/raster state; a Samsung
WebView quirk with `aspect-ratio` + percentage positioning (top nodes prove
`%` resolves, but rasterization is a separate step).

### What changed (`HomeHub.tsx`)

- The orbit container gained `[transform:translateZ(0)]` — its own
  compositing layer, so the compositor rasterizes the container and all 8
  nodes atomically instead of culling them individually. One small (340px)
  layer; no layout change (verified: identical node rects before/after).
- Comments updated to record the round-5 position. No change to the node
  buttons themselves — there was nothing left to remove.
- **HONEST LIMIT: this is a targeted hardening, NOT a proven fix.** It is
  the standard Android-WebView remedy for exactly this failure mode, but it
  was verified only headlessly (all 8 still painted, no regression). **The
  phone test is the gate: if Drive/Docs/Sheets/Bank are still missing on
  Mahdi's phone, the cause is deeper than CSS and the next step is a
  structural change (e.g. rendering the nodes as in-flow grid items or as
  SVG inside the ring that already paints), not another class tweak.**

## 3. Chat — three real holes found and fixed (all verified headless)

### (a) The reply never re-scrolled into view — FIXED (`page.tsx`)

The scroll effect depended on `[messages.length]`. A reply REPLACES the
pending bubble with the same id and the same length, so the effect never
fired for it; the 350ms re-assert only covered replies arriving within
350ms of the send. A real reply arrives seconds later and sat below the
fold — "typed message goes but no answer". The effect now depends on
`[messages]` and tracks the last message (`prevLastRef`): it scrolls when
the thread grows (as before) OR when the pending bubble resolves into its
answer (same id, was `pending`, text changed). A restored thread carries
fresh ids and mount has no previous last message, so neither scrolls —
the mount rule (open on the hero, not the end of the feed) is preserved.

Verified: after sending against the mock backend, the reply lands and
`main.scrollTop` reaches the new maximum (2580/3242 at 412px, 2705/3252 at
360px) with the reply fully in view.

### (b) Tapping the «ادامه حقوق مصرف‌کننده» chip looked dead — FIXED (`page.tsx`)

The chip opens the Consumer Rights wizard, which renders inside `main`
below the fold; nothing scrolled to it. Added a zero-height anchor
`<div id="echomind-surface">` above the wizard surfaces and
`scrollToSurface()` (double `requestAnimationFrame` → `scrollIntoView()`),
called from all five surface openers (`openDelayWizard`,
`openRightsWizard`, `openShieldWizard`, `openScan`, `openTravel`) — so the
chip tap, the action rail, and `openParsedPillar` all bring the opened
wizard into view.

Verified: chip tap moves `main.scrollTop` 0 → 1888 (412px) / 1898 (360px)
and the anchor lands inside the main viewport (`anchorInMainView: true`).

### (c) A 503 was retried to a wrong base and surfaced as "could not connect" — FIXED (`services/api.ts`)

`isRetryable` returned true for 502/503. The mock-live probe proved the
harm: `streamChat` 404 → `sendChat` 503 → `withBase` retried the next
candidate base (same-origin `/api/v1` in the web build, which has no API)
→ HTML 404 → JSON parse error → `network_error` → the user saw
«الان نتوانستم به سرور وصل شوم» ("couldn't connect") for a server that was
reachable and answering 503. A 502/503 means the server ANSWERED — it is up,
just busy or unconfigured — so retrying another base only masks the cause,
the same reasoning as the existing 404 exclusion. `isRetryable` now returns
true only for `network_error` / `timeout` (the base might actually be down).

Verified against the mock backend (stream 404, `/chat` 503): the reply is
now the truthful «سرور الان شلوغ است. لطفاً لحظه‌ای دیگر دوباره تلاش
کنید.» (`answerServerBusy`), and the mock log shows exactly
`POST /api/v1/chat/stream -> 404` then `POST /api/v1/chat -> 503`.
Note: in the Capacitor app there is only one candidate base (Railway), so
the retry was already a no-op there — this fix changes the web/preview
build and any multi-base case, and makes the error text truthful.

### What the chat fallback does NOT fix

A real answer still needs the PR #2 merge (the branch backend has
`/chat/stream` + the always-answer guidance) + a Railway redeploy + the
Gemini key. Until then the honest in-app answer for a general question is
the server-busy / server-old text, not a generated reply. The app-side job
done here is: never silence, never a vanishing message, and an error that
names the true cause.

### Probe methodology note (CORS)

The first mock runs returned the misleading offline/failed text because the
mock had no CORS headers: the page (127.0.0.1:18081) calling the mock API
(127.0.0.1:18080) was blocked from reading the responses, so
`resolveApiBase` marked the mock failed and fell back to the same-origin
base, whose HTML 501s became generic failures. The mock now sends
`Access-Control-Allow-Origin: *` and answers OPTIONS. The app behaviour is
unchanged; the probe was wrong. (Same silent-fallback shape exists in the
web build when a configured base is CORS-blocked — noted, not changed in
this round; the Capacitor app has no same-origin base.)

## What changed per file

- `frontend/src/app/globals.css` — glass-sphere orb (idle stack +
  recording red-core stack), red-core composer mic medallion
  (`.echomind-medallion-recording`). No other CSS touched.
- `frontend/src/app/components/HomeHub.tsx` — orbit container
  `[transform:translateZ(0)]` layer + comments. Node buttons unchanged
  (already plain).
- `frontend/src/app/page.tsx` — scroll effect re-scrolls when the pending
  reply lands (`prevLastRef`, dep `[messages]`); `#echomind-surface`
  anchor + `scrollToSurface()` in all five surface openers.
- `frontend/src/services/api.ts` — `isRetryable` no longer retries 502/503.
- `docs/echomind-voice-round5.md` — this doc.
- Backend: NOT touched. No backend tests run (nothing to test).

## Verification (overlay `~/workspace/echomind/.verify-round5/`)

- `npx tsc --noEmit`: **0 errors**.
- `node scripts/test-speech.mjs`: **all cases pass**.
- `npm run export:android` (`NEXT_PUBLIC_API_URL=http://127.0.0.1:18080/api/v1`):
  **exit 0**, static export ready.
- Headless probe `probe-round5.mjs` (+ `sample-nodes.py`), mock live backend
  (health 200, `/chat/stream` 404, `/chat` 503, `/providers` 404, protected
  endpoints 401), fa locale, seeded thread matching Mahdi's state:
  - **412×915:** all 8 nodes PAINTED at scroll top (elementFromPoint +
    pixels 57–211); orb hold → `data-state="recording"`, specular kept,
    red core present; release → `idle`, no red core; chip tap → scrolls to
    wizard; chat → truthful server-busy reply, in view at the bottom.
  - **360×800:** same — all 8 PAINTED, orb hold/release, chip scroll,
    server-busy reply in view. (The 360 pixel-brightness column is invalid:
    the sampler hardcoded the 412 scale; `elementFromPoint` is the evidence
    at 360.)
  - Screenshots: `probe/shot-412-top.png` (idle glass orb — spokes visible
    through the glass), `probe/shot-412-orb-red.png` (red core inside the
    glass, mic red), `probe/shot-412-chat.png`.
- Backend suite: not run (backend untouched).

## What remains unverified / still needs Mahdi

- **Orbit nodes on the phone.** The container-layer hardening is unverified
  on a real device. If the four nodes are still missing after installing the
  round-5 APK, say so plainly and change the rendering structure — do not
  apply another class tweak.
- **The orb's glass look on the phone.** Headless screenshots read as glass
  (idle) and red-from-inside (hold), but the Samsung WebView's rasterizer is
  exactly the component that mis-painted the nodes, so the orb must be
  judged on his screen, not on the screenshots here.
- **Real chat answers:** PR #2 merge decision + Gemini key (both only Mahdi
  can supply). Until then the app answers with the honest server-busy /
  server-old text.
- **Clerk publishable key** (repo secret `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  still unset — the APK has no sign-in) and the **MENTOR session cookie**,
  **TrueLayer**, **Meta app**, **Google scopes** — all still open from
  earlier rounds.
- **No push/CI/message in this round.** Staged only; waiting for Mahdi's
  «بفرست».

## Note on `push-echomind.py`

The script still crashes with `UnicodeDecodeError` on the 16 binary PNGs in
its FILES list (known, untouched in this round — the manual paths-file route
is used for pushes instead). This doc was added to the FILES list
(`docs/echomind-voice-round5.md`, after the round-4 entry) so the eventual
push includes it. FILES count is now 222.
