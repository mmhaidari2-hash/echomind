# EchoMind — the ten best ideas (world-best build)

Mahdi's direction, 2026-11-26: "go make it the best — look at what the
top ten in the world have, take them as models, add the ten best ideas,
read the repository, do there everything you wanted to do for the
launcher — like six months from now with a ten-person team."

## The ten

| # | Idea | What it is | Where it lives | Doc |
|---|------|-----------|----------------|-----|
| 1 | **Inbox Watch** | Gmail scanned for deadlines/rights/renewals/refunds; proposals go through propose → confirm → audit into the Life Graph | `backend/app/services/detection.py`, `backend/app/api/endpoints/detection.py` | `docs/inbox-watch.md` |
| 2 | **Promise Chaser** | Follow-up cadence (check −3d / verify on the day / chase +7d / escalate +14d) + draft chase emails, sent only through Bounded Authority | `services/followup.py`, `endpoints/followup.py` | `docs/promise-chaser.md` |
| 3 | **Outcome Verifier** | Verifies an obligation/promise against Gmail (verified / awaiting / failed), persisted in the Life Graph | `services/verification.py`, `endpoints/verification.py` | `docs/outcome-verifier.md` |
| 4 | **Delay Repay Claim Pack** | Estimate + draft + filing deadline (journey + 28d) + operator claim page + evidence checklist + filing obligation | `services/claim_pack.py`, `endpoints/claim_pack.py` | `docs/claim-pack.md` |
| 5 | **Consumer Rights Case File** | Pathway + notice + 30-day / 6-month deadlines, stored as a Life Graph case node with guarding obligations | `services/case_file.py`, `endpoints/case_file.py` | `docs/case-file.md` |
| 6 | **Renewal Guard** | Decision deadline (renewal − 7d), annual cost parsed from £ amounts, keep/cancel/switch + calendar blocker | `services/renewals.py`, `endpoints/renewals.py` | `docs/renewal-guard.md` |
| 7 | **Travel Guard** | Calendar trips × Gmail bookings: confirmed / missing_booking / disruption | `services/travel_guard.py`, `endpoints/travel_guard.py` | `docs/travel-guard.md` |
| 8 | **Morning Brief** | Deterministic daily digest, ranked by urgency, English + Persian | `services/briefing.py`, `endpoints/brief.py` | `docs/morning-brief.md` |
| 9 | **Evidence Locker** | Completeness scoring + exportable JSON evidence pack for court/ombudsman/FOS | `services/evidence.py`, `endpoints/evidence.py` | `docs/evidence-locker.md` |
| 10 | **Calendar Guard** | Overlap + travel-risk detection on the upcoming calendar | `services/calendar_guard.py`, `endpoints/calendar_guard.py` | `docs/calendar-guard.md` |

## What is shared

- **Design system** — `frontend/src/app/globals.css` (glass tokens,
  3D, waterfall, RTL) + `frontend/src/app/components/Glass.tsx`
  (GlassCard, Orb3D, Reveal, Waterfall, SectionHeading). One language
  for the mobile app and the website.
- **Website** — `frontend/src/app/site/page.tsx`: product/landing
  experience in the same frontend (a route, not a new top-level app —
  no owner approval needed for a new app, because there is none).
  See `docs/website.md`.
- **Bilingual EN/FA** — every new surface (all ten ideas, the website,
  the mobile card, empty states, errors) in English and Persian, with
  proper RTL layout and the Vazirmatn typeface the repo already loads.
  See "Persian coverage" below.
- **Rules kept** — additive changes only; backend/frontend split;
  security boundaries server-side; no secrets in the client; every
  record owner-scoped; high-impact actions need confirmation +
  idempotency + audit; fail closed; no workflow changes; main untouched.

## Verification (this run)

- Backend: `pytest backend/tests/ -q` — **90 passed** on a copy of the
  repo backend overlaid with the staging area (29 pre-existing +
  10 Inbox Watch + 51 new). Run with a local venv
  (fastapi 0.165, pydantic 2.14, pytest 9.2) — the repo's own
  requirements plus pytest/httpx.
- Frontend: `npx tsc --noEmit` on a scratch copy with the staged files
  overlaid — see the final report for the result.
- Not yet verified (needs Mahdi): CI (`backend-tests.yml`,
  `android-apk.yml` via workflow_dispatch), the Android build, the
  physical-device run, Gemini live generate (gated on his key).

## Persian coverage — what is full, what is partial

- **Full**: all ten ideas' UI strings and API reasons, the Morning
  Brief, the follow-up draft emails, the website, the mobile card,
  empty states and the errors the app itself produces.
- **Partial, by design**:
  - Operator/brand names and claim URLs stay English (proper nouns).
  - Upstream error text from Google/Gmail (e.g. a 401 message) is
    passed through in English — it is the provider's text, not ours.
  - The Gemini-generated chat reply is English-first (Gemini live
    generate is gated on Mahdi's key and was not built here); the
    EN/FA toggle already switches the voice and the UI around it.
  - Statute references (Consumer Rights Act 2015 sections) are English
    legal citations; the explanation around them is bilingual.

## What still needs Mahdi

1. Create branch `doodombeh/echomind-next` from main (SHA 7565ead) in
   the GitHub web UI (the GitHub App cannot create branches — 403).
2. Run `~/workspace/echomind/push-echomind.py "message"` to push the
   staged files.
3. Dispatch CI (`backend-tests.yml`, `android-apk.yml`) via
   workflow_dispatch; install the CI debug APK
   (`com.echomind.assistant`), sign in, connect Google, My Life →
   "Check inbox".
4. Gemini key, if he wants live chat generation (gated, not built).

## Added scope (2026-11-26, after the ten ideas)

- **Persian understanding + voice** — see `docs/persian.md`. The
  deterministic intent layer (Persian/English, typed or spoken)
  answers structured requests with no key; open-ended Persian still
  needs Mahdi's Gemini key. Voice: Web Speech fa-IR in, device voice
  out today; Gemini-TTS (fa-IR preview) is wired and ready for the
  same key — no natural voice has been heard yet, because there is no
  key in hand.
- **Project delegation** — see `docs/project-delegation.md`. The
  registry + propose → confirm → execute + evidence path works
  end-to-end (stubbed GitHub verified); the live GitHub call from
  this VM gets HTTP 403 (shared-egress rate limit, no token) and
  fails closed as designed. A `GITHUB_TOKEN` unlocks private repos.
- **Connections hub** — see `docs/connections-hub.md` and
  `docs/home-restyle.md`. Better than the reference Mahdi sent: glassy
  3D, shows what each connection powers, and visibly one surface of the
  wider EchoMind. The home screen itself IS the hub now (EchoMind orb
  at the centre, apps orbiting on spokes, "N apps connected" pill).
  Real connectors: Gmail, Calendar, Drive, Docs, Sheets (Google OAuth,
  Drive/Docs/Sheets via the `?scopes=` parameter), Bank (TrueLayer
  Open Banking, read-only), Instagram (Instagram Login), YouTube
  (youtube.readonly on the shared Google token) — see
  `docs/connectors-bank-instagram-youtube.md`. Slack/Notion still have
  no connector and are honestly marked "coming soon", never faked.
