# Hub layout fix — gap + scroll-fade (2026-11-27)

Two bugs Mahdi reported with screenshots (2026-11-27 ~03:56 GMT).
Both are fixed in `frontend/src/app/page.tsx` and
`frontend/src/app/components/HomeHub.tsx`. No feature, string, or
theme change.

## Bug 1 — the gap / orb pushed below the fold

**Root cause (proven by a live probe).** `page.tsx` had a `useEffect`
on `messages.length` that called
`main.scrollTo({ top: main.scrollHeight, behavior: "smooth" })`.
It fired on mount even with an empty or restored thread, so opening
the app yanked the viewport to the bottom of a ~2000 px page:
measured `scrollTop` 3 at t=1 s, then **1183** at t=3 s and stuck
there. The hero, orb and hub were scrolled far above the viewport,
which is exactly the "huge empty area" in Mahdi's screenshot 1.
Contributing factor: the hub was ~950 px tall in a ~600 px visible
main area, so even at `scrollTop` 0 the orbit bottom was cropped.

**Fix.**
- `page.tsx`: the scroll effect now scrolls to the bottom **only
  when `messages.length` increases** (a new message), tracked with
  a `prevMessagesLength` ref. A restored thread sets the ref to the
  restored length, so it is never treated as a new message. Mount
  never scrolls.
- Compaction so the hub fits: main `pt-6` → `pt-3`, `pb-6` →
  `pb-10` (clearance above the chat dock), column `gap-8` → `gap-5`;
  orbit `max-w-[340px]` → `max-w-[320px]`; "so what?" card and
  coming-soon row `mt-4` → `mt-3`. Page `scrollHeight` 2012 → 1952.

## Bug 2 — top orbit nodes disappear while scrolling

**Root cause.** The hub was built from scroll-linked visibility:
`Reveal` / `MotionReveal` wrappers (framer-motion `useInView` /
`whileInView`) around the count pill, the orbit and the "so what?"
card, plus pointer parallax on the orbit container
(`rotateX`/`rotateY` springs with `transformPerspective: 900`).
Pixel sampling of Mahdi's screenshot 3 confirmed the top 4 nodes
were genuinely absent while the bottom 4 painted. The mechanism
could not be reproduced in headless Chrome (all 8 nodes stayed at
opacity 1 there), so it is device-specific — a WebView compositing
/ `IntersectionObserver` race with the mount-time auto-scroll, in a
3D perspective context the mobile GPU can mis-cull mid-scroll.
The robust fix removes the whole class instead of chasing the race.

**Fix (`HomeHub.tsx`).** The hub now renders statically:
- count pill, orbit and "so what?" card are plain `<div>`s — no
  `Reveal` / `MotionReveal`, no `whileInView` anywhere on the hub;
- the orbit container is a plain div — the pointer parallax
  (`useMotionValue`/`useSpring`, `handleOrbitMove`/`resetOrbit`)
  and the 900 px perspective are gone (mouse-only on a phone);
- the tick ring still turns, the "so what?" card still crossfades
  between apps (`AnimatePresence`), the spotlight/beam stay.
  The "APP 01" card also gets the `pb-10` dock clearance from
  `page.tsx`, so it is no longer clipped behind the dock.

## Verification (headless Chrome, 360×800, static export)

- `tsc --noEmit`: pass. `next build`: pass (`/` 54.4 kB, 252 kB
  first load). Static export: `/` and `/site` both **200**.
- Built CSS has no fixed pixel height above 44 px
  (only `100dvh` app shell and `88dvh` sheet — viewport-relative).
- Natural load: `scrollTop` stays **0** at 1/3/6/10 s (was 1183).
- Orbit fully inside the main viewport at `scrollTop` 0
  (orbit 399–719 vs main bottom 723), even with the offline banner
  showing in the test environment.
- All 8 nodes at opacity 1, hit-testable, at scroll 0, 150, 350
  and back to 0; orbit `transform` is now `none`.
- Known test-env limit: this headless-shell binary does not paint
  the brief card / count pill into screenshots or PDF (even with
  inline solid-red backgrounds), although the DOM reports them
  laid out, opacity 1, correctly styled and hit-testable.
  Mahdi's own screenshot 3 proves the pill paints on his real
  phone, so this is a headless-renderer artifact, not a page bug.
  Verify the brief card visually on the phone after install.

## Files changed

- `frontend/src/app/page.tsx` — scroll only on new message;
  tighter spacing, dock clearance.
- `frontend/src/app/components/HomeHub.tsx` — static hub, no
  scroll-linked reveal, no 3D parallax, smaller orbit.
- `docs/hub-layout-fix.md` — this note.

Not pushed, not merged. PR #2 stays open until Mahdi approves.
