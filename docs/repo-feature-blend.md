# Repo-feature blend — EchoMind's look, mixed from several top repos

Mahdi's standing rule (2026-11-26): never take an idea from ONE source —
mix ideas AND features from several top GitHub repos/apps so the result is
different from everyone else and number one. This pass goes further than
the blend (commit 1929068: SparkFlow warmth + Linear precision + Raycast
speed + Vercel typography) and pulls CONCRETE visual features from real
top repos into the home hub and the website. Everything is reimplemented
as a pattern in EchoMind's own code — no copied code, no new dependencies.

## Attribution — which repo contributed which visible feature

| Repo | Feature in EchoMind | Where |
| --- | --- | --- |
| **magicui** | Animated gradient/shimmer text — honey shimmer travelling across the hero accent word (`echomind-shimmer-text`) | `/site` hero |
| **magicui** | Bento grid — six differentiators as a bento, first card spans two columns (`echomind-bento`, `echomind-bento-featured`) | `/site` differentiators |
| **magicui** | Animated border beam — a honey beam travelling around the border (`echomind-beam`, `@property --beam-angle`) | `/site` featured bento card, home "so what?" card |
| **magicui** | NumberTicker pattern — connected count ticks up on a spring instead of snapping (`AnimatedCount` in `Glass.tsx`) | Home hub pill + readout |
| **Aceternity UI** | Spotlight card — a soft honey glow that follows the pointer (`SpotlightCard`, `.echomind-spotlight`) | Home "so what?" card, DelegatedWork cards, `/site` bento + outcome + Loop cards |
| **Aceternity UI** | 3D card — pointer-driven tilt on springs, RTL-mirrored yaw (`TiltCard`) | `/site` bento + outcome cards |
| **shadcn/ui + framer-motion** | Layout animation — one shared honey bar glides between ActionRail rows (`layoutId="echomind-rail-selected"` in `CommandRow`) | Home ActionRail |
| **shadcn/ui + framer-motion** | AnimatePresence crossfade — the "so what?" card body crossfades when the selected app changes (`SoWhatContent`) | Home hub |
| **shadcn/ui + framer-motion** | Spring physics everywhere — counters, tilt, parallax, row bar all run on springs, not linear tweens | Home hub + `/site` |
| **react-three-fiber patterns (CSS 3D, no library)** | Pointer parallax — the whole orbit leans a few degrees toward the pointer on springs | Home hub orbit |
| **react-three-fiber patterns (CSS 3D, no library)** | Slow-spinning instrument dial — the 24-tick ring turns once per 90s (`echomind-orb-ring-spin`) | Home hub orbit |

## What stays EchoMind's own

The warm cream/brown/honey base, Linear hairlines + mono precision,
Raycast command speed, and the orb + hub-and-spokes + Outcome Loop as
the unifying thread. A reviewer can name which repo each effect came
from, while the whole still reads as EchoMind — not as SparkFlow, not
as Linear, not as magicui.

## Performance and accessibility

- All new animation is transform / background-position / opacity only —
  no layout work per frame. Spotlight writes CSS vars on the element
  (no React re-render per pointer move); the counter writes
  `textContent` via a ref (no re-render per frame).
- `prefers-reduced-motion` disables the shimmer, beam, tick-ring spin,
  parallax, tilt and crossfade; the counter jumps to its final value.
- Tilt, parallax and spotlight are mouse-only (`pointerType === "mouse"`,
  `@media (hover: hover)`) — touch scrolling is untouched.
- RTL: tilt yaw mirrors, the layout bar uses logical `start-`, the
  spotlight is symmetric, Persian labels stay plain semibold with no
  mono/tracking on Persian text.
- No new dependencies. First-load sizes stayed near the previous
  build: `/` 245 kB (was 231 kB, +14 kB from the extra motion
  imports), `/site` 172 kB (was 161 kB, +11 kB) — no blow-up.

## Files changed (frontend only)

- `frontend/src/app/globals.css` — shimmer text, bento grid, border
  beam (`@property`), spotlight, spinning tick ring; the static
  selected-row inset shadow removed (replaced by the layout bar).
- `frontend/src/app/components/Glass.tsx` — `AnimatedCount`,
  `SpotlightCard`, `TiltCard`, `beam` prop on `GlassCard`, layout bar
  in `CommandRow`.
- `frontend/src/app/components/HomeHub.tsx` — animated connected
  counts, orbit parallax, spinning tick ring, spotlight + beam +
  crossfade on the "so what?" card (`SoWhatContent` extracted).
- `frontend/src/app/components/DelegatedWork.tsx` — spotlight on
  project cards and the empty-state card.
- `frontend/src/app/site/page.tsx` — shimmer hero accent, bento
  differentiators, spotlight + tilt on bento/outcome cards, spotlight
  on the Loop card.
- `docs/repo-feature-blend.md` — this file.

No feature, section or string was removed or added. Backend untouched.

## Verification

- `tsc --noEmit`: exit 0 (re-run after the amber-300 fix, still 0).
- `next build`: exit 0 — `/` 47.6 kB / 245 kB first load,
  `/site` 17.4 kB / 172 kB.
- Static render check (`next start` + curl): `/` 200, `/site` 200,
  with the new effects present in the built HTML/CSS.
- Zero dark-palette Tailwind classes (slate/sky/violet/cyan/blue,
  amber-300, yellow-400) in the staged src — two pre-existing
  `border-amber-300/30` in `DelegatedWork.tsx` were re-pointed to
  `border-honey/30` during this pass.

## Still unverified

- Visuals on a real phone/browser — no screenshots (Playwright
  download denied by Mahdi, not retried). The blend has to be seen
  before anyone claims it looks right.
- Live native camera on a real phone; live OAuth for
  Bank/Instagram/YouTube; CI on this staging.
