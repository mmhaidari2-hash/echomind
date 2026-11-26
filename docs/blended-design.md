# The blend — EchoMind's own design, not a copy of one source (2026-11-26)

Mahdi's direction (2026-11-26 ~17:07 GMT): "Don't take the idea from
one [source] — mix several together so the result is different from
the rest."

The warm redesign (docs/warm-redesign.md) copied SparkFlow's language
too directly — warm cream/brown/amber + serif, on its own, reads as
"the SparkFlow look". This pass re-blends it: the warmth stays, but
three other top products/repos are mixed in, and EchoMind's own
identity is the thread that holds them together. The result must look
like EchoMind, not like any one of the sources.

## What was blended

### Warm base — kept (SparkFlow, Mahdi's reference)
- Cream canvas `#F3EAD9`, card cream `#FFFDF7`, dark brown ink
  `#2B1E12`, honey/amber accents `#B7791F` / `#D9A45B`.
- Fraunces serif display type (italic honey accents), rounded
  editorial cards, waterfall feed, warm honey 3D orb, hearth aurora.

### Linear — precision
- Hairlines do the work: 1px `rgb(122 90 48 / 0.16)` dividers
  (`.echomind-hairline`, `.echomind-row` dividers, card borders)
  instead of heavy glass borders and big soft shadows. Glass shadow
  re-pointed quieter (`--glass-shadow`: 1px + soft 28px, was 18px/40px).
- Tabular numbers everywhere technical: counts, refs, step numbers
  (`echomind-num-mono`, `font-variant-numeric: tabular-nums`).
- Tight, consistent rhythm: dense rows, 0.5s precise motion (was
  0.65s floaty), crisp focus rings.
- Status as a dot + label (`StatusDot`), object ids (`APP 01` …
  `APP 08`).

### Raycast — speed
- The ActionRail is now a dense command list, not four big cards:
  one glass slab, hairline rows, one job per row, `↵` to run it
  (`CommandRow` in `components/Glass.tsx`).
- The composer is a command bar: `⌘K` focuses it from anywhere
  (global Cmd/Ctrl+K listener + chip button), attach menu items
  carry kbd hints (`P` photo, `C` camera, `F` files), `↵` on the
  hub connect action.
- `Kbd` component: real kbd chips, not decorative text.

### Vercel / Arc — bold typography
- JetBrains Mono (via `next/font/google`) for technical labels, counts,
  refs, step numbers — the mono face is Vercel's precision instrument.
- One accent used sparingly and boldly: honey appears on numerals,
  the active row's inset bar, the single gradient-text phrase in the
  hero — nowhere else shouts.
- Tight-tracked display type: hero `tracking-[-0.03em]`,
  `leading-[1.05]`, larger on desktop; section titles
  `tracking-tight`; mono eyebrows (`echomind-meta`: uppercase, wide
  tracking, 10px).

### EchoMind's own thread — the unifier
- The glass orb stays the centre of the hub, but it is now a
  precision instrument: a 24-tick dial ring around the orbit (both
  hubs), exact 45° node geometry, hairline spokes.
- The hub-and-spokes stays the home screen's identity; the drawer
  hub shows the same 8 apps with the same states.
- The Outcome Loop stays the five steps, but as one instrument: a
  hairline track with mono step markers (`01`–`05`) crossing the
  numerals, not five separate cards.
- The "so what?" cards stay — denser, with an object id and a
  status dot on top.

## RTL safety

Mono labels use letter-spacing and uppercase — both break joined
Arabic/Persian letters. Rule: mono + tracking is used ONLY on Latin
technical readouts (counts, `APP 01`, `STEP 01`, kbd chips). Localised
labels (status words, eyebrows in Persian) use plain semibold text,
and `[dir="rtl"] .echomind-meta` drops letter-spacing and uppercase
entirely. Verified by code inspection (no Persian string sits inside
an `echomind-meta` or `font-mono … tracking-*` class).

## Real top GitHub repos — actually installed and used

- **shadcn/ui** (already installed): Button + Card, extended use —
  the hub connect actions, the site CTAs, the dense cards.
- **framer-motion** (already installed): `MotionReveal` tightened to
  Linear-quick (0.5s, 14px rise, `useReducedMotion` respected).
- **next/font**: Fraunces + Vazirmatn (already) + **JetBrains Mono** (new,
  `layout.tsx`).
- **lucide-react**: installed alongside (icon set for future use).
- No new runtime dependency was added for this pass (JetBrains Mono is a
  font, loaded by `next/font`).

## What changed

- `frontend/tailwind.config.ts`: `fontFamily.mono` = JetBrains Mono var.
- `frontend/src/app/layout.tsx`: JetBrains Mono via `next/font/google`.
- `frontend/src/app/globals.css`: blend section — quieter
  `--glass-shadow`, `--hairline`, `.echomind-meta`,
  `.echomind-num-mono`, `.echomind-kbd`, `.echomind-row`,
  `.echomind-hairline`, `.echomind-command-list`,
  `.echomind-loop-track`, RTL safeguard for mono labels.
- `frontend/src/app/components/Glass.tsx`: `Kbd`, `StatusDot`,
  `CommandRow` (new); `SectionHeading` mono eyebrow + tight title;
  `MotionReveal` tightened; `GlassCard` `dense` prop.
- `frontend/src/app/components/HomeHub.tsx`: tick-ring dial,
  mono technical readout (`08 APPS · 02 CONNECTED · ORBIT 01`),
  mono node labels, dense "so what?" card (APP id + status dot +
  `↵`), mono coming-soon chips.
- `frontend/src/app/components/ConnectionsHub.tsx`: same precision
  treatment in the drawer (tick ring, mono labels, APP id + status
  dot in the selected panel, mono engine chips).
- `frontend/src/app/components/ChatInput.tsx`: `⌘K` focus chip +
  global Cmd/Ctrl+K listener, kbd hints on the attach menu.
- `frontend/src/app/components/ActionRail.tsx`: dense command list
  (5 rows incl. Consumer Rights, new `rights` icon); new copy key
  `actionHintRights` (EN/FA) in `frontend/src/app/lib/copy.ts`.
- `frontend/src/app/components/DelegatedWork.tsx`: mono repo identity
  line, mono status pill, off-palette yellow gradient fixed to honey.
- `frontend/src/app/site/page.tsx`: tighter hero type, mono numerals
  + flat hairline cards on differentiators/outcomes, Loop as a
  hairline stepper, mono footer line.

## What did NOT change

- Every feature, screen, section and string is kept — this is a
  re-blend, not a removal. One new copy key was added
  (`actionHintRights`, EN + FA); no string was removed or rewritten.
  Bilingual EN/FA with correct RTL is unchanged.

## Verification

- `tsc --noEmit` and `next build` pass (see the verification run in
  the delivery report).
- Static render check (`next start` + curl): `/site` and `/` both
  200; new classes present (`font-mono`, `echomind-kbd`,
  `echomind-row`, `echomind-num-mono`, `echomind-meta`); zero
  dark-palette Tailwind classes in the staged app.
- Visuals are NOT verified: no screenshots exist (the Playwright
  browser download was denied by Mahdi — not retried). The blend has
  to be seen on a real phone / in the browser before anyone claims
  it looks right.
