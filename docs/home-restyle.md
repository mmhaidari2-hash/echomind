# Home restyle — the home screen IS the hub

## What changed

The home/welcome screen was the one screen the first world-best build
never touched: flat dark cards on a navy background. It is now restyled
in the same glassy 3D language as the website and the rest of the app
(`frontend/src/app/globals.css` design tokens + `Glass.tsx`), and —
more importantly — restructured around what Mahdi asked for.

### The home screen is the hub

`frontend/src/app/components/HomeHub.tsx` — EchoMind's own 3D orb at
the centre, the owner's apps orbiting it in a circle on spokes, a
"N apps connected" pill at the top, green checkmarks on the connected
apps. The orbit is an SVG ring + spokes with glass node buttons; it is
symmetric, so Persian RTL needs no mirror.

Tapping an app answers **"so what?"** — a detail card under the orbit
says what that connection powers inside EchoMind (Gmail watches the
inbox for delays/refunds/renewals; Calendar guards the deadlines;
Drive holds the evidence; Docs drafts the case files; Sheets tracks
refunds; Bank spots duplicate charges; Instagram/YouTube help with the
channels), plus a Connect / Request access button where a tap can
actually do something.

### Real states only

Every node reads a real status endpoint (Google, Instagram, YouTube,
Bank). States: connected / not connected / needs setup / coming soon /
unknown (not signed in). **Never a mock checkmark.**

- Gmail + Calendar: real Google OAuth; the base connect grants both
  scopes (`READ_SCOPES = gmail.readonly + calendar.readonly`).
- Drive / Docs / Sheets: same Google account, extra scopes. They are
  connectable from the hub: `POST /connectors/google/start?scopes=…`
  (new optional query param on the Google start endpoint, only
  `https://` scope URLs accepted) requests the Drive/Docs/Sheets scope
  on the shared token. Until the scope is granted they show "needs
  setup", not "connected".
- Bank, Instagram, YouTube: real connectors — see
  `docs/connectors-bank-instagram-youtube.md`.
- Slack, Notion: **no connector exists**. They sit in an honest
  "coming soon" strip below the orbit, not in it. No checkmark, no
  fake state.
- Instagram here is EchoMind's own connector, not Muse's.

When the missing piece is server-side (bank needs a TrueLayer account,
Instagram needs a Meta app, Google not configured at all), the detail
card says so and no Connect button is offered — a button that can only
fail is worse than none. When a connect attempt does fail, the server's
own reason is shown.

### Delegation is visible from home

`frontend/src/app/components/DelegatedWork.tsx` — the other half of
the home screen. The hub answers "what is connected"; this answers
"what is it doing for me". It lists the owner's projects and their
delegated tasks (proposed / running / done / failed / needs you), with
plan progress, results and evidence. A proposed task shows its plan and
a **Confirm and run** button — nothing runs without the owner's
confirmation (Bounded Authority).

Each project has a **Delegate** button that pre-fills the chat composer
with e.g. "In My Project, do this: " (Persian: "تو پروژهٔ … این کار
رو بکن: ") and focuses it. The message input (chat + voice, Persian +
English) is where the owner says "go do this in my such-and-such
project" — the delegation path (project registry, propose → confirm →
run with allowlists, evidence trail) is reachable and visible from home.

### What stayed

Everything from the old home screen is kept, restyled: EN/FA toggle,
Auth setup, زمینه (Context), Delay Repay card, message input, mic,
attach, send. The hero is now a compact greeting (the big HeroOrb is
gone — the hub's orb is the centrepiece now). The ActionRail waterfall
and the wizards sit below the hub and the delegated work, so the wider
EchoMind engines stay visible — the product is not reduced to the hub.

### Verification

- Backend: `pytest` 145 passed (129 before + 15 new connector tests +
  1 Google `?scopes=` test).
- Frontend: `tsc --noEmit` passes, `next build` passes.
- No screenshots: the Playwright browser download was denied by the
  owner (2026-11-26), so the visuals are **not verified** — the owner
  needs to see the rebuilt APK on his phone.

## Files

- `frontend/src/app/page.tsx` (compact hero, HomeHub + DelegatedWork)
- `frontend/src/app/components/HomeHub.tsx` (new)
- `frontend/src/app/components/DelegatedWork.tsx` (new)
- `frontend/src/services/api.ts` (Instagram/YouTube/Bank clients,
  `listProjectTasks`, `startGoogleConnection` gains optional
  `extraScopes`)
- `backend/app/api/endpoints/connectors.py` (Google start gains
  optional `?scopes=`)
- `backend/tests/test_connectors.py` (new `?scopes=` test)
- `docs/connectors-bank-instagram-youtube.md`

## Warm redesign + all 8 apps (2026-11-26)

The hub was restyled again in the warm editorial language (cream, dark
brown, honey, Fraunces serif, framer-motion entrance, shadcn Button for
the connect action) — see `docs/warm-redesign.md`. It also now shows all
8 apps: Bank, Instagram and YouTube were missing from the orbit even
though their connectors existed. The app list and status loading live in
the shared `frontend/src/app/components/hubApps.ts`, so the home hub and
the drawer hub can never drift apart again.
