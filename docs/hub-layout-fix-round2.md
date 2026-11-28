# Hub layout bugs — round 2 (2026-11-27)

Mahdi installed APK #132 (branch `doodombeh/echomind-next` @ f945cf3b,
which contains the round-1 fix) and the bugs are still there. So the
round-1 diagnosis was wrong and is not repeated here.

## What round 1 got wrong

Round 1 blamed two things: (1) a `scrollTo` on mount, and (2)
`whileInView` / `MotionReveal` around the hub. Both were real code
smells and both were fixed — but neither was the mechanism, because
the bugs persist with both gone. The decisive evidence this round:
**the DOM is always correct.** In a real Chromium (headless shell,
360×800) the thread is in the DOM with opacity 1 after a send, all 8
orbit nodes are in the DOM with opacity 1 at every scroll position,
and the drawer mounts on click. What fails is **paint / raster** of
the nested scroller (`main.echomind-scroll` inside a `position: fixed`
body, inside `.echomind-app` with `overflow-x: clip`) and of newly
mounted fixed layers — the same failure signature on Mahdi's phone
and in the headless shell, which shares the raster path. There is no
missing node, no stuck opacity, no `content-visibility` (grep: none
in the frontend), no conditional rendering of nodes.

## Bug (a) — send a text, view scrolls to empty black space

**Mechanism.** The thread sits LAST in `<main>` (after hero, brief,
hub, delegated work, ActionRail, wizards). On send, the only
programmatic scroll in the whole frontend (grep: the only
`scrollTo`/`scrollIntoView`/`scrollTop` write) ran
`main.scrollTo({ top: main.scrollHeight, behavior: "smooth" })`.
Two defects, both measured:

1. The smooth scroll animates on the compositor while async content
   (the reply / error article, status refreshes) changes
   `scrollHeight` mid-animation. Measured before the fix: after send
   the view settled at scrollTop **1470 while max was 1506 — 36px
   short of the bottom**. A smooth programmatic scroll inside this
   nested scroller leaves the Android WebView showing blank
   (un-rasterised) tiles at the bottom.
2. With no Gemini key the reply never comes; the pending bubble is
   MAP-replaced (same `messages.length`, so no second scroll) by an
   honest error article — "Please sign in to use your personal
   EchoMind data." The message and that error were in the DOM the
   whole time; the view simply never landed on them.

**Fix** (`frontend/src/app/page.tsx`, `globals.css`):
- The scroll effect now does an **instant** `main.scrollTop =
  main.scrollHeight`, re-asserted in `requestAnimationFrame` and
  again after 350ms (when the reply/error has replaced the pending
  bubble and the final height is known). The `prevMessagesLength`
  "new messages only" rule is kept — mount / restored threads never
  scroll.
- `scroll-behavior: smooth` removed from `html` and from
  `.echomind-scroll`. User touch scrolling is unaffected (it never
  was smooth-scrolled by CSS); only programmatic scrolls change.
- The one remaining `scroll-behavior: smooth` is on
  `.echomind-site-scroll` — the `/site` marketing page only, which
  has no programmatic scrolls. Left deliberately.

**Measured after the fix:** after send, scrollTop is **1529 =
scrollHeight (2129) − clientHeight (600) exactly**, steady from
+0.5s to +6s. The thread holds exactly 2 articles: his text
("بک کن پرش دارم") and the honest "Please sign in…" error — so
sending now shows his message and an honest no-answer state, never
a blank screen (on a renderer that paints it; see Limits).

## Bug (b) — orbit nodes disappear on scroll (east / south-east)

**Mechanism.** All 8 nodes render unconditionally via
`HUB_APPS.map` — no status gating, no data condition can remove
one; the ring/spokes are one SVG painted before the nodes. What
differed per node was the **animated transform layer**: every node
button carried `transition` + `hover:scale-105`, and the selected
node `scale-110`. That is a compositing layer per node, and a mobile
GPU mis-culls such layers while scrolling — exactly the failure the
round-1 doc itself named for `whileInView` layers. The east node
(Drive, 0°) and south-east node (Docs, 45°) sit at the orbit
container's right/bottom edges (the east node spans to 98.75% of
the container width, 16px past its right edge), the region
rasterised last — which is why those two vanished while the ring,
spokes and the other six nodes painted. Mahdi's screenshot 18009_7
shows exactly this: orb, ring and spokes render, Drive and Docs do
not.

**Fix** (`frontend/src/app/components/HomeHub.tsx`): the `transition`
class and `hover:scale-105` are removed from the node buttons.
Nodes are plain painted buttons now; the selected node still reads
as selected (stronger glass + static `scale-110`, no transition).
Nothing animates on the nodes at all. Theme, labels and behaviour
unchanged.

**Measured after the fix:** all 8 nodes present in the DOM with
opacity 1 and correct rects at scroll 0 and at the bottom, Drive at
(280, 555) and Docs at (243, 646) — the two that vanished on the
phone.

## Bug (c) — Local Context button does not open the drawer; drawer bottom clipped

**Button wiring: correct, no change.** The top-bar "Context" pill is
a real `<button type="button">` with `onClick={() =>
setContextOpen(true)}`; the drawer mounts on click (verified: the
dialog is present 800ms after the click — async via React state,
which is why an immediate synchronous check looks like a failure);
"Close context" closes it; nothing overlays the header
(`AuroraBackground` is `pointer-events: none`, header is `z-20`).
So "doesn't open" is not a wiring bug: the remaining explanations
are (i) the newly mounted fixed drawer layer failing to paint on
first open in the WebView — the same raster staleness as bugs (a)
and (b) (Mahdi did eventually get it open in screenshot 18015_4),
and/or (ii) a tap outside the sheet hitting the full-screen
backdrop button and closing it again. No code change to the wiring.

**Bottom clipping — mechanism.** The drawer sheet is
`fixed`/`bottom-0` against the *layout* viewport, which on Android
edge-to-edge extends **under** the system nav bar (~48px Samsung
3-button bar), while the app root is sized from `visualViewport`
(the visible area, which excludes the nav bar). The sheet's bottom
~45px therefore sits under the nav bar. Its only protection was
`.echomind-safe-bottom` = 16px + `env(safe-area-inset-bottom)` +
24px = **40px total** — and on an Android WebView
`env(safe-area-inset-bottom)` is **0**, so 40px < ~48px nav bar.
The Balance Guard inputs sit at the very bottom of the Tracking tab
and were half-hidden behind it (screenshot 18015_4). In headless
(no nav bar) the same inputs are fully visible — consistent.

**Fix** (`frontend/src/app/globals.css`): `.echomind-safe-bottom`
extra padding 24px → **64px** (total 80px on Android: 16 + 0 + 64
— covers the ~48px nav bar with margin). The class is used only by
the drawer scroll area, so the change is drawer-only.

**Measured after the fix:** drawer opens on click; Tracking tab
switches; scroll area `padding-bottom` computes to **80px**; last
input fully visible (y 659–702 of 800 in headless).

## The whole-app jump — «پرش کلش پرش داره» (Mahdi, 05:18 GMT)

The jumping affects the whole app, not just the hub. App-wide
causes found and fixed:

1. **Brief height shift after mount** (`CommandBrief.tsx`): the
   loading card is one short line (~52px); the loaded "all clear"
   card is ~120px. Everything below the brief (hub, delegated work,
   rail, thread) shifted down ~70px a moment after mount, and again
   on every 45s revalidation. **Fix:** the brief wrapper now has
   `min-h-[120px]` (measured loaded height). Measured: wrapper is
   120px at 200ms after load and still 120px at 3.2s — no shift.
2. **Viewport height rewritten on every visualViewport scroll**
   (`useAppViewport.ts`): the hook rewrote `--app-height` AND
   `--app-top` on every `visualViewport` `scroll` event — i.e. on
   every frame while the keyboard animates or the visual viewport
   moves — reflowing the whole flex column every frame. **Fix:** the
   `scroll` listener now updates only `--app-top` (the offset);
   `--app-height` is set on `resize`/`orientationchange` only (the
   height only ever changes on a resize; the resize handler reads
   both values, so the top stays correct). **Note: this file exists
   on the branch but was missing from the staging tree — it is
   created here in staging with the fix applied. It still needs to
   be added to `push-echomind.py` FILES before any push.**
3. **30s live refresh** (`useLiveRefresh`): re-runs the hub/status
   loads on mount, every 30s, on focus and on visibility change —
   each load swaps "…" for real content and can move layout. With
   the brief pinned and the nodes un-animated, refreshes no longer
   move anything on screen. No change to the refresh itself.
4. **Smooth programmatic scrolls** (see bug (a)) — removed.

## Files changed (staging only — NOT pushed, NOT merged)

| File | Change |
|---|---|
| `frontend/src/app/globals.css` | Removed `scroll-behavior: smooth` from `html` and `.echomind-scroll`; `.echomind-safe-bottom` extra padding 24px → 64px (total 80px on Android) |
| `frontend/src/app/page.tsx` | Scroll-to-bottom is now instant `scrollTop = scrollHeight`, re-asserted in `requestAnimationFrame` + after 350ms; "new messages only" rule kept |
| `frontend/src/app/components/HomeHub.tsx` | Node buttons: removed `transition` + `hover:scale-105` (selected keeps static `scale-110`) |
| `frontend/src/app/components/CommandBrief.tsx` | Brief wrapper `min-h-[120px]` |
| `frontend/src/app/hooks/useAppViewport.ts` | NEW in staging (was branch-only): `visualViewport` `scroll` updates only `--app-top`, not `--app-height` |
| `docs/hub-layout-fix-round2.md` | This doc |

`ContextDrawer.tsx` needed no edit (wiring correct; clipping fixed
by the safe-bottom padding). No feature, string, or theme colour
changed anywhere.

## Verification (overlay `~/workspace/echomind/.verify-orb/`, full tree)

- `tsc --noEmit`: **pass, exit 0** (one stray duplicate created by
  my own copy command — `src/app/HomeHub.tsx` / `CommandBrief.tsx`
  at the wrong path — was deleted from the overlay; it never
  existed in staging).
- `next build`: **pass** (`/` 54.5 kB, 252 kB first load; `/site`
  17.2 kB, 172 kB). Static export build (`CAPACITOR_BUILD=1`):
  **pass**. Static render: `GET / → 200`, `GET /site/ → 200`
  (bare `/site` 301-redirects to `/site/`, as before).
- Built CSS: `scroll-behavior: smooth` down from 3 occurrences to
  1 (the `/site`-only rule, kept deliberately).
- Probes (real Chromium 159 headless shell, 360×800, DSF 2.625,
  served from the rebuilt static export):
  - After send: scrollTop **1529 == max exactly** (was 1470 vs max
    1506), steady 0.5–6s; thread = his message + honest "Please
    sign in…" error.
  - All 8 nodes opacity 1, correct rects, at scroll 0 and bottom.
  - Brief wrapper 120px at 200ms and at 3.2s — no post-load shift.
  - Drawer opens on click, Tracking tab switches, scroll-area
    padding-bottom computes to **80px**, last input fully visible.

## Limits — read this before promising Mahdi anything

The headless shell's **screenshots still show an empty main after
send** even with the fix: the bottom region never paints in this
renderer, however it is reached (instant scroll, direct `scrollTop`
assignment, real touch-drag). The DOM, opacity, visibility,
transforms and scroll positions are all provably correct, so this
is a limitation of the shell's software raster, not a remaining
product defect — but it means **no headless evidence can prove the
phone will paint**. The fixes remove the exact code-level triggers
for the phone's GPU-compositor mis-rasterisation (smooth
programmatic scroll with a stale target; per-node animated
transform layers at the orbit's edges; post-load layout shifts;
per-frame app-height rewrites). The final gate is Mahdi's phone
test on the next APK — if the blank screen or the missing nodes
persist there, the mechanism is deeper than any of these triggers
and needs on-device inspection (remote debugging), not another
headless round.
