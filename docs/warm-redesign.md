# Warm redesign — the design stops looking AI-made (2026-11-26)

Mahdi's verdict on the first glassy purple/blue design: the website does
not have what he asked for — warm colours, glassy, waterfall scroll, 3D —
and it looks obviously AI-made. He is right: the old palette was the
default "AI slop" look (dark navy, sky/violet gradients). This redesign
replaces it with a real, distinctive design language, using his own
SparkFlow app as the reference.

## The language (SparkFlow reference)

- **Warm cream background** `#F3EAD9`, card cream `#FFFDF7`, deep cream
  `#F0E4CB`.
- **Dark brown text** `#2B1E12` (bark), soft `#3D2C1C`, faint `#6B5638`.
- **Amber/gold accents** `#B7791F` (honey), light `#D9A45B`, deep
  `#8A5A1B`, pale `#F0DDBB`.
- **Elegant serif display type**: Fraunces (serif display, with italic
  for accents) via `next/font/google`, Vazirmatn for Persian, clean
  system sans for body.
- **Rounded cards** (1.4rem), editorial layout, big amber serif
  numerals ("01 / 02 / 03"), letterspaced honey eyebrows.
- **Waterfall scroll**: the masonry feed (`Waterfall` in `Glass.tsx`),
  staggered entrances.
- **Glassy 3D**: the warm honey glass orb (radial gradients, inner
  glow, highlight), hearth aurora (amber glows on cream), warm glass
  header/chips/composer, dark-brown pill buttons.

## Real top GitHub repos — actually installed and used

- **shadcn/ui** (`frontend/src/app/components/ui/`): real Button and
  Card components in the new-york style, with warm variants (default
  dark-brown, secondary cream, outline honey, ghost, destructive).
  Built on `class-variance-authority` + `clsx` + `tailwind-merge` +
  `@radix-ui/react-slot` (`cn()` in `frontend/src/app/lib/utils.ts`).
  Used in the website (hero CTAs, differentiator and outcome cards,
  footer) and in both hubs (connect buttons).
- **framer-motion**: real motion — `MotionReveal` in
  `frontend/src/app/components/Glass.tsx` (fade + rise on scroll,
  staggered delays, `useReducedMotion` respected). Used on the site
  hero, differentiator and outcome cards, the loop, the footer, and the
  home hub orbit and "so what?" card.
- **next/font**: Fraunces (opsz/SOFT/WONK axes, normal + italic) and
  Vazirmatn, loaded in `frontend/src/app/layout.tsx` as CSS variables.
- **lucide-react**: installed alongside (icon set for future use).

## What changed

- `frontend/tailwind.config.ts`: the whole palette re-pointed at warm
  tokens (canvas/cream/deep/sand/bark/honey/clay/carbon/navy/metal);
  old dark-navy token names re-pointed at warm equivalents so existing
  class names keep working. `fontFamily.serif` = Fraunces + Vazirmatn.
- `frontend/src/app/globals.css`: warm cream base, warm glass tokens,
  honey gradient text, `.spark-serif` / `.spark-num` / `.spark-eyebrow` /
  `.spark-card` / `.spark-btn-dark`, warm honey 3D orb, hearth aurora,
  warm glass header/chips/logo/composer, dark-brown send button.
- `frontend/src/app/layout.tsx`: Fraunces via next/font, themeColor
  `#F3EAD9`, light colour scheme.
- `frontend/capacitor.config.json`: background `#F3EAD9` (root, android,
  splash screen, status bar), notification icon `#B7791F`.
- `frontend/src/app/site/page.tsx`: editorial rewrite — serif display
  hero with italic honey accent, shadcn Card + big amber numerals for
  the six differentiators, numbered Outcome Loop with serif titles,
  shadcn Card waterfall for the outcomes, shadcn Button CTAs. All copy
  and all sections kept, both locales.
- Mobile home UI: serif hero title (`page.tsx`), serif ActionRail
  titles, serif wizard titles (Delay Repay, Consumer Rights, Overdraft
  Shield), serif context-drawer heading, serif project names
  (`DelegatedWork`), serif section headings (`Glass.tsx`
  `SectionHeading`), shadcn Button for the hub connect actions.
- Every staged component was remapped from the dark palette
  (slate/sky/violet/cyan/blue) to the warm one; zero dark-palette
  Tailwind classes remain in the staged app.

## What did NOT change

- Every feature, screen, section and string is kept — this is a
  redesign, not a removal. Bilingual EN/FA with correct RTL is
  unchanged.

## Verification

- `tsc --noEmit` and `next build` pass (see the verification run in the
  delivery report).
- Visuals are NOT verified: no screenshots exist (the Playwright
  browser download was denied by Mahdi — not retried). The design has
  to be seen on a real phone / in the browser before anyone claims it
  looks right.
