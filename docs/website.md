# EchoMind website — route `/site`

## What it is

A single Next.js App Router client page at
`frontend/src/app/site/page.tsx`, served by the **same frontend** as the
mobile app — not a new top-level app (the repo keeps its `backend/` +
`frontend/` split; no new application was introduced). It links into the
real app at `/` and does not redesign any existing app screen (Welcome,
Delay Repay, Document Scan, Consumer Rights, My Life are untouched).

## What the page contains

1. **Header** — EchoMind mark, EN/FA toggle, "Open the app" button (`/`).
2. **Hero** — 3D glass orb (`Orb3D`), headline ("An assistant that
   finishes things — not just answers."), subtitle, two buttons
   (Open the app → `/`; "See how it works" → `#how` anchor).
3. **Six differentiators** — Personal Life Graph, Obligation Engine,
   Promise Tracker, Outcome Loop, Bounded Authority, UK-first outcome
   engines — as tilt glass cards in a `<Waterfall>` with `<Reveal>`
   cascade.
4. **Outcome Loop** — the five steps plan → confirm → act → verify →
   follow up as a numbered glass strip, with the honest note that a
   step EchoMind cannot verify is never reported as finished.
5. **"What it does for you"** — a waterfall feed of six concrete
   outcomes: Delay Repay claim, consumer-rights case, renewal decision,
   promise chased, trip checked, morning brief.
6. **Footer** — states plainly that EchoMind is in development and that
   Gmail/Calendar come first.

No invented prices, testimonials, user counts, or claims about
features that do not exist yet.

## Design system

Only the already-built shared design system is used — no new
dependency, no new Tailwind config, no new design language:

- `frontend/src/app/components/Glass.tsx` — `GlassCard`, `Orb3D`,
  `Reveal`, `Waterfall`, `SectionHeading`.
- `frontend/src/app/globals.css` tokens — `.echomind-glass`,
  `.echomind-glass-strong`, `.echomind-gradient-text`,
  `.echomind-scene`, `.echomind-tilt`, `.echomind-orb-3d`,
  `.echomind-waterfall`, `.echomind-reveal`, `.echomind-site-scroll`.
- Tailwind theme tokens already in the repo
  (`tailwind.config.ts`): `bg-canvas`, `border-metal-line`,
  `shadow-cta`, sky/violet accents.

Layout fact: the app shell locks body scroll
(`html,body { overflow: hidden }`), so the page scrolls inside its own
`<div className="echomind-site-scroll">` container (100dvh,
`overflow-y: auto`). It never relies on body scroll.

## Bilingual EN/FA

- One inline dictionary, `const copy: Record<Locale, SiteCopy>`, keyed
  by a `locale` state — every string (hero, sections, cards, buttons,
  footer) exists in both languages.
- Header toggle switches `en` ⇄ `fa`; the choice persists in
  localStorage under `echomind.locale` and is read on mount.
- A `useEffect` on locale sets `document.documentElement.lang`,
  `document.documentElement.dir` (`rtl` for Persian, `ltr` for
  English) and toggles the `font-fa` class — exactly like the app's
  `page.tsx`. Vazirmatn is already loaded by the root layout; no font
  was added.
- Layout uses logical Tailwind utilities (`ms-`/`me-`/`ps-`/`pe-`/
  `text-start`); no hard-coded left/right positioning.

## Design-only vs working

- **Working route**: `/site` is a real route in the frontend; its
  "Open the app" buttons link to the real app at `/`.
- **Design-only in the sense that it presents, not performs**: the
  page itself takes no actions, stores no user data and makes no API
  calls. The outcomes it describes (Delay Repay, consumer rights,
  etc.) are the product's working engines, reached through the app —
  the page is their shop window, not a second copy of them.

## How to verify

```sh
# Copy the page and the staged design-system files into the
# verification frontend copy, then typecheck:
cp ~/workspace/echomind/work/doodombeh-echomind-next/frontend/src/app/site/page.tsx \
   ~/workspace/echomind/.verify-fe/src/app/site/page.tsx
cp ~/workspace/echomind/work/doodombeh-echomind-next/frontend/src/app/globals.css \
   ~/workspace/echomind/.verify-fe/src/app/globals.css
cp ~/workspace/echomind/work/doodombeh-echomind-next/frontend/src/app/components/Glass.tsx \
   ~/workspace/echomind/.verify-fe/src/app/components/Glass.tsx
cd ~/workspace/echomind/.verify-fe && ./node_modules/.bin/tsc --noEmit
```

`tsc --noEmit` must pass with no errors. Only after that, optionally
`npm run build` (slow) to confirm the route builds.

## Warm redesign (2026-11-26)

The first glassy purple/blue design looked obviously AI-made. The page
was redesigned in the warm editorial language — cream, dark brown,
honey, Fraunces serif display, big amber numerals, shadcn/ui Card +
Button, framer-motion entrances. All copy and all sections kept. See
`docs/warm-redesign.md`. Visuals are not verified (no screenshots).
