# EchoMind Dark Obsidian redesign — overhaul audit

This doc records the complete architectural audit and visual/functional
overhaul that replaced the warm editorial theme (cream `#F3EAD9`, brown,
honey, Fraunces serif) with **Dark Obsidian** (`#090A0F` + glassmorphism
+ Amber-Gold `#E5A93C`). All features, sections and strings are kept;
EN/FA bilingual + RTL is unchanged. No new dependencies were added.

## 1. Mockup analysis (what was taken, what was NOT)

Mahdi sent three reference mockups. They were used ONLY as visual,
spacing and colour-system references. Nothing in them was copied as
content:

- **Mockup 1 (action waterfall + dock + top bar):** waterfall cards
  with alternating left/right offsets and a gold Approve pill; a
  single-row pill chat dock (paperclip left, mic + gold send right);
  a floating pill top bar (Context / Auth setup / green status dot /
  EN / فا).
- **Mockup 2 (Context drawer):** drag handle, gold-outline Close pill,
  Context/Tracking tabs with a gold active tab, an "ACTIVE CONNECTIONS"
  header with a synced pill and icon nodes with green dots,
  "AUTO-INFERRED CONTEXT" chips, a "Regional & Advanced Defaults"
  accordion, and LIVE WORKSPACE counter tiles.
- **Mockup 3 (home hub):** the "EchoMind" title ABOVE a glossy golden
  3D orb, 8 glass icon nodes on a thin ring, a "TODAY'S BRIEF" card
  with an Approve & Run action, the same pill dock.

**Deliberately NOT copied:** every sample number and text string in
the mockups ("6 apps synced", "2 Active Deadlines", "£14.20",
"18 min late", "Richmond to Waterloo", "Home: Richmond", etc.). All
of those are bound to real live backend state; empty states say so
honestly. The mockup app icons are illustrative only (Slack, Dropbox,
Telegram) — the orbit ring and drawer show OUR real 8 connectors
(Gmail, Calendar, Drive, Docs, Sheets, Bank, Instagram, YouTube)
with official brand SVG icons, never the mockup's apps.

## 2. Diagnosis: "Providers could not be read" / "Connection status could not be read"

The status functions already use the right session/token headers
(`auth: "protected"` with the Clerk Bearer token). The errors happen
because the production backend still runs `main`, where the new
status endpoints do not exist yet — the calls 404. The fix is honest
UI, not a header change:

- `services/api.ts`: a 404 now carries `code: "endpoint_missing"`,
  and a new `isEndpointMissing(error)` helper detects it.
- `ConnectionsHub`, `ProvidersPanel`, `HubStatus`, `CommandBrief`:
  an `outdated` state says the feature "arrives with the next app
  update" instead of a generic read failure. A 409 says the service
  is not connected yet. Nothing is ever faked as connected.

**Blocked by:** the merge of `doodombeh/echomind-next` into main
(and the Railway redeploy that follows). Until then the hub keeps
showing the outdated state — correctly.

## 3. What was fixed, file by file

### Design system
- `tailwind.config.ts` — rewritten. Tokens: `obsidian #090A0F`,
  `panel #10121A`, `ink #F4F5F7` / `ink.soft #C9CEDA`,
  `muted #9AA1B0`, `gold #E5A93C` / `light #F2C268` /
  `deep #C98F22`. Sans = Plus Jakarta Sans → Inter. Serif aliased
  to sans as a safety net. All warm tokens deliberately removed so
  stale classes fail loudly.
- `app/layout.tsx` — Fraunces removed, Plus Jakarta Sans
  (`--font-jakarta`) added; `themeColor #090A0F`, `colorScheme "dark"`.
- `app/globals.css` — fully rewritten Dark Obsidian system:
  - `.echomind-glass` is FLAT (no backdrop-filter). In-flow cards sit
    over a static aurora; blur buys nothing there and costs frames.
  - `.echomind-glass-blur` is used ONLY on floating surfaces
    (header, dock, drawer, menus) — the heavy-blur layers are few.
  - `.echomind-living-orb` with `data-state` idle / listening /
    thinking / executing (breathing, ripple rings, rotating conic
    core, crisp pulse — transform/opacity only).
  - `.echomind-cascade-item` (40 ms stagger via `--cascade-index`),
    `.echomind-sticky-header`, `.echomind-safe-bottom`
    (`calc(1rem + env(safe-area-inset-bottom) + 24px)`),
    `.echomind-gold-btn`, waterfall offset classes (alternating cards
    step left/right via margins, not transforms; 0.75rem under 380px),
    a dark aurora (faint gold glows on obsidian).
- Mechanical warm→obsidian remap of 25 files (token map in the
  `~/workspace/echomind/.obsidian-remap.py` scratch script, NOT part
  of the push). Garbled classes the script produced were fixed by
  hand (`Glass.tsx`, `ChatInput.tsx`, `ui/button.tsx`,
  `ui/card.tsx`, `HomeHub.tsx`, `ConnectionsHub.tsx`).
  **Zero warm/beige/serif classes remain in source or rendered HTML**
  (only two intentional comments described the change; both were
  reworded). A late audit catch: `InstallPrompt.tsx` (a repo-main-only
  file the first remap never touched) still used `bg-carbon/95`,
  `border-metal-line` and slate text — it was copied into the staging
  tree, remapped to obsidian tokens, and added to FILES.
- Gold-button contrast: every solid gold button now uses
  `text-obsidian` (dark text on gold), not `text-ink`/`text-white`
  (`LifeSummaryCard`, `GoogleConnectionsCard`, `HubStatus`,
  `ProvidersPanel`, `page.tsx`).

### Living orb
- `app/components/Glass.tsx` — new `LivingOrb` (props `size`,
  `state`: idle / listening / thinking / executing), `Orb3D` kept as
  an alias rendering LivingOrb idle, `HeroOrb` takes `state`, new
  `Cascade` component (framer-motion spring stagger 40 ms, once on
  mount; reduced-motion renders statically). No static text is stamped
  across the sphere; the brand title sits above it.
- `app/components/HomeHub.tsx` — fully rewritten: no title/subtitle
  block, no Refresh button (auto-refresh, 30 s); centred "N apps
  connected" pill; `LivingOrb` size 150 with live state (listening
  via the `echomind-listening` window event from the dock,
  executing/thinking via props); orbit radius 40 (keeps 56 px nodes
  inside a 360 px viewport), 24-tick ring, gold ring/spokes; nodes are
  brand icons only (no labels, no text stamped on the orb); the
  "so what?" card keeps the full name (with brand icon), status pill,
  powers, Connect / Request access; coming-soon strip with brand
  icons.

### Brand icons
- `app/components/BrandIcons.tsx` (new) — official brand SVG icons,
  stroke-based `currentColor`: Gmail, Calendar, Drive, Docs, Sheets,
  Bank, Instagram, YouTube, Slack, Notion.
- `app/components/hubApps.ts` — `glyph: string` → `icon: BrandIconId`
  on all 8 apps + coming-soon; `loadHubStatuses()` also returns
  `outdated: boolean` (true when all 4 endpoints fail AND at least
  one failure was 404 / `endpoint_missing`).

### Real-time updates (no manual Refresh)
- `app/hooks/useLiveRefresh.ts` (new) — polling (30 s default) +
  focus / visibility / auth-ready revalidation, no overlapping loads,
  `refreshNow` exposed.
- `HomeHub`, `ConnectionsHub`, `DelegatedWork`, `ProvidersPanel`,
  `HubStatus`, `CommandBrief` all use it. The manual Refresh buttons
  on the home hub and DelegatedWork are gone.

### Command Brief (proactive, home screen)
- `app/components/CommandBrief.tsx` (new) — "Today's Command Brief":
  loads `getPendingOutcomes`, `getMorningBrief`,
  `listProjects` + `listProjectTasks`, `scanInboxForDeadlines` in
  parallel (`Promise.allSettled`); rows sorted delegation →
  detection → outcome → info, max 6; real actions only: Approve &
  Run (`confirmProjectTask`), Add/Dismiss (propose via
  `life.create_obligation` / promise + `confirmAction` /
  `dismissDetectionProposal`), Verify (`verifyOutcome`), Edit (opens
  the wizard via `onOpenPillar`); honest empty state ("All clear —
  nothing needs you right now."), outdated state (all sources 404 →
  "arrives with the next app update"), Google-missing hint on 409;
  auto-refresh 45 s.
- `app/page.tsx` — the brief sits above the hub; the orb receives
  `thinking={sending}` and
  `executing={authorityBusy || pendingAction !== null}`.

### Top bar & hero
- `app/page.tsx` — the header is now the mockup's floating pill top
  bar: Context pill, Auth setup, green status dot, EN / فا. No logo,
  no title in the bar; safe-area top padding; the "ASSISTANT" page
  header collision is gone. The hero is a centred "EchoMind" title
  above the orb + subtitle. `main` keeps `overflow-x-clip`.

### Context drawer
- `app/components/ContextDrawer.tsx` — drag handle, Close as a
  gold-outline pill (`min-h-[44px]`, gold text), active tab =
  `echomind-gold-btn`, sheet uses `echomind-glass-blur`, scroll area
  gets `echomind-safe-bottom` so bottom inputs (Usual operator,
  Usual bank) are never hidden behind the system nav bar; passes
  `lifeSnapshot` to `ConnectionsHub` and `PreferencesCard`.
- `app/components/ConnectionsHub.tsx` — fully rewritten (drawer,
  mockup 2): "ACTIVE CONNECTIONS" header + live green pill "N apps
  synced"; horizontal scrollable row of 64 px glass tiles with brand
  icons + green dot on connected / gold "!" on needs_setup;
  selected-app card below; **LIVE WORKSPACE counters** (Active
  Deadlines = overdue + due-soon obligations, Pending Follow-ups =
  open promises, Connected Workspace = connected/total) from the
  `LifeSnapshot` prop + live hub states — never hardcoded; outdated
  state message; useLiveRefresh 30 s; coming-soon strip with brand
  icons.
- `app/components/ProvidersPanel.tsx`, `app/components/HubStatus.tsx`
  — `outdated` state (isEndpointMissing → "arrives with the next app
  update" instead of "could not be read"); mount-only `useEffect`
  refresh replaced with `useLiveRefresh` (60 s).

### Zero-friction context
- `app/lib/contextSuggestions.ts` (new) — derives Home station /
  Work station / Usual operator / Usual bank / Usual retailer
  suggestions ONLY from the user's own stored data (memory facts from
  parsed documents + Life Graph obligations/promises), matched against
  known UK operator/bank/retailer lists. Nothing is invented.
- `app/components/PreferencesCard.tsx` — auto-inferred chips (mockup
  2): one tap fills the field, with the source shown ("from a
  document" / "from a deadline" / "from a promise"); honest "no
  suggestions yet" state when nothing matches; manual inputs stay
  editable. Secondary locale fields (Command language, External
  language, Jurisdiction, Currency) are inside a collapsible
  "Regional & Advanced Defaults" accordion; defaults auto-derive from
  Home market (GB → GBP, en-GB, GB) and stop following the market
  once the user edits one by hand.

### Action waterfall & DelegatedWork
- `app/components/ActionRail.tsx` — the dense Raycast command list
  became waterfall cards (big title + hint, alternating offsets,
  `Cascade` 40 ms stagger) matching mockup 1; all five actions and
  their handlers kept; the visible ⌘K chip is gone (the keyboard
  shortcut stays).
- `app/components/DelegatedWork.tsx` — Refresh button removed
  (useLiveRefresh 30 s); project/task cards are waterfall cards
  (`echomind-waterfall-offset` + `Cascade`); task instruction text
  gets `min-w-0 flex-1` so the status pill never pushes it off-screen
  at 360 px; gold gradient buttons use `text-obsidian`.

### Chat dock
- `app/components/ChatInput.tsx` — the dock is ONE pill row:
  `echomind-glass-blur` `rounded-full` containing a plain paperclip
  icon (left), a single-line textarea (rows=1, capped at one line
  with internal scroll — no auto-grow to 128 px), a mic icon, and a
  gold send icon (right). The visible ⌘K chip is gone (the shortcut
  stays). Listening changes dispatch
  `window.dispatchEvent(new CustomEvent("echomind-listening"))` so
  the orb ripples. Attach menu, photo flows and notices unchanged.

### Site
- `app/site/page.tsx` — mechanically remapped to the new tokens;
  hero uses the gold gradient; no warm classes left.

## 4. What is still blocked

- **Merge into main** (owner decision, unanswered). Until the branch
  is merged and Railway redeploys, the new backend endpoints do not
  exist in production — the hub, providers and Command Brief show the
  honest "arrives with the next app update" state, and the APK talks
  to the old backend.
- **Provider keys**: GPT / Claude / Cursor keys (and endpoints) for
  the provider slots; the **Gemini API key** for live open-ended
  chat, Muse-level Persian and the natural Persian voice.
- **Connector credentials**: TrueLayer (Bank), Meta app (Instagram),
  Google Cloud enables + scope grants (YouTube, Drive, Docs, Sheets).
- **MENTOR sign-in** (session cookie into the Hub panel) and the
  paused-worker caveat: MENTOR's workers are currently paused, so
  delegated tasks queue until the owner enables a worker.
- **GitHub token (`repo` scope)** for private-repo delegation verbs.

## 5. What is unverified

- No screenshots (Playwright browser download denied by Mahdi — not
  retried). Visuals were verified only by static render + class grep.
- No live OAuth flow has run for Bank / Instagram / YouTube /
  Drive / Docs / Sheets.
- No live device test (360–430 px checked by layout math and static
  render only: orbit radius 40 + 56 px nodes, drawer node row scrolls
  internally, `overflow-x: clip` on the app root).
- No live call to MENTOR has run yet.
- The Gemini-TTS live call is unverified (no key in hand).
