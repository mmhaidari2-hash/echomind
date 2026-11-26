# EchoMind vs the top 3 — an honest comparison

Date: 2026-11-26. Written for Mahdi's question: "compare the best three
apps in the world with ours — do we have everything they have, plus ten
more things?"

## Method and sources

- The three: **ChatGPT (OpenAI), Gemini (Google), Claude (Anthropic)** —
  the three by reach and capability in late 2026. No other app belongs
  above any of them on that test; Copilot, Perplexity and the rest sit
  below on reach, even where they win a niche.
- Their capabilities: web search 2026-11-26 (reviews and product pages
  dated June–November 2026). Where a feature is beta, rolling out, or
  US-only, that is stated — a beta is not counted the same as a shipped
  feature.
- EchoMind: read from the repo itself — `~/workspace/echomind/repo`
  (`main`, HEAD `7565ead`) and the staging area
  `~/workspace/echomind/work/doodombeh-echomind-next/` (the world-best
  build). Every EchoMind claim is marked by state (see legend). The
  branch's own test suite was re-run for this comparison (see
  "Verification" at the end).

## State legend — read this before the table

- **LIVE** — on Mahdi's phone now: the installed APK (CI run #122,
  built from branch `doodombeh/echomind-next`) talking to the
  production Railway backend, which runs `main`.
- **BRANCH** — built and tested on `doodombeh/echomind-next`, pushed to
  GitHub (commit `bd3b67c`), **not deployed**. The backend on the phone
  is still `main`, so a BRANCH backend feature does not work on the
  phone today. A BRANCH frontend feature is in the APK only where the
  CI export included it.
- **NOT BUILT** — does not exist in the repo at all.
- **IN PROGRESS** — a second agent is building it right now
  (home-screen restyle + Instagram / YouTube / TrueLayer-bank
  connectors, started 2026-11-26 ~15:04 GMT). Unverified, not counted.

## Two live facts that decide most of the table

Probed 2026-11-26, public endpoints, no sign-in:

- Production backend is up:
  `GET /api/v1/health` → `{"status":"healthy"}`.
- **Gemini is NOT configured on production:**
  `GET /api/v1/ready` →
  `{"status":"ready","gemini":{"configured":false,"model":"gemini-2.0-flash","status":"unconfigured"}}`.
  The chat code exists (`generate_with_memory` in
  `services/gemini.py`) but there is no key, so the app on Mahdi's
  phone answers from fixed pillar packs only. There is no open-ended
  AI chat on the phone today.

## Feature table

| Capability | ChatGPT | Gemini | Claude | EchoMind |
|---|---|---|---|---|
| Open-ended chat with a live frontier model | Yes — GPT-5.x/6, reasoning, multimodal | Yes — Gemini models, tiered | Yes — Opus 4.7 | **NOT BUILT (live).** Code exists, key missing; phone answers from fixed packs only |
| Real-time natural voice conversation | Yes — Advanced Voice, interruptible, video | Yes — Gemini Live | Yes — voice on mobile | **NOT BUILT.** Web Speech STT + device TTS only (LIVE, partial). Gemini-TTS plumbing is BRANCH, never run, no key |
| Voice input (speech-to-text) | Yes | Yes | Yes | **LIVE** — `useSpeechRecognition`, fa-IR / en-GB |
| Memory across chats (persistent, editable) | Yes — persistent memory, opt-in, editable | Yes — Personal Intelligence (beta, US, paid) + chat history | Yes — memory shared across chat/Cowork, editable, chat search | **LIVE** — memory engine + Life Graph, owner-scoped. But with no live model, memory cannot drive open chat |
| Structured Life Graph (obligations, promises, nodes, edges, evidence) | No — chat memory, not a graph of obligations | No | No — Projects hold files/instructions, not obligations | **LIVE** — nodes, edges, obligations, promises, snapshot (`services/life.py`) |
| Proactive detection from the inbox (deadlines/rights/refunds found before you remember) | No — can search Gmail, does not detect obligations | Partial — Personal Intelligence / Proactive Assistance surface info; no dated obligations with evidence + confirmation | No | **BRANCH** — Inbox Watch (see § Ten extras) |
| Email: read / search | Yes (connectors) | Yes (Gmail, native) | Yes (Gmail connector) | **LIVE** — Gmail OAuth read |
| Email: send / draft through confirmation | Yes (agent, with confirmations) | Yes | Yes | **LIVE (partial)** — write scopes exist; the draft-chase flow is BRANCH |
| Calendar: read / act | Yes | Yes (native) | Yes | **LIVE** — Calendar OAuth read; write scopes exist |
| Morning / daily brief | Yes — Tasks can deliver one; no flagship digest | Partial — Daily Brief announced, US paid subscribers, rolling out | No flagship digest (scheduled tasks can make one) | **BRANCH** — Morning Brief (deterministic, ranked, EN/FA). Same category as Gemini's Daily Brief — not unique as a concept |
| UK Delay Repay engine (tiers, payout estimate, claim draft, operator) | No | No | No | **LIVE** — full engine on `main` (`services/delay_repay.py`); one-call Claim Pack is BRANCH |
| UK Consumer Rights engine (pathways, statute refs, notice) | No | No | No | **LIVE** — full engine on `main` (`services/consumer_rights.py`); Case File persistence is BRANCH |
| Promise tracking + follow-up chase | No | No | No | **LIVE (records)** — promises in the Life Graph; chase cadence + drafts are BRANCH |
| Outcome verification against evidence (verified / awaiting / failed, persisted) | No — reports "done" on a tool call | No | No | **BRANCH** — Outcome Verifier |
| Renewal tracking (decision deadline, cost, keep/cancel/switch) | No | No | No | **BRANCH** — Renewal Guard |
| Travel checks (trips × bookings: missing confirmation / disruption) | Partial — can search bookings on request | Partial — surfaces boarding passes, trip info | No | **BRANCH** — Travel Guard. (Main already has travel quote/confirm.) |
| Evidence export for court / ombudsman / FOS | No | No | No | **BRANCH** — Evidence Locker |
| Calendar overlap + travel-risk detection | No | No | No | **BRANCH** — Calendar Guard |
| Scheduled / recurring tasks that run in the cloud | Yes — Tasks | Partial — Spark is always-on (trusted tester); routines via Assistant | Yes — hourly/daily/weekly, cloud, laptop closed | **NOT BUILT.** The chaser cadence proposes dates; nothing executes on a schedule |
| Project delegation (tell it "do X in project Y", allowlisted, evidence) | Partial — Codex / Agent do coding and web tasks, not cross-repo delegation with per-project allowlists | Partial — Spark works across Workspace, not GitHub repos | Partial — Cowork works in folders you grant, with a plan + approval; no GitHub-repo delegation | **BRANCH** — registry + propose→confirm→run, 3 verbs (latest commit, open issues, obligation). Live GitHub call unverified (HTTP 403 from this VM, no token); registry starts empty |
| File work (read/write/edit files, produce docs, sheets, decks) | Yes — Work/Codex produce files | Yes — Workspace docs/sheets | Yes — Cowork: files, Word/Excel/PowerPoint, M365 add-ins | **NOT BUILT.** Document parsing exists on `main` (read only). Nothing produces a file |
| Image generation / video / deep research / code execution | Yes — image gen, Sora video, Deep Research, Codex | Yes — image/video, Deep Research | Partial — no image/video gen; research via browser + connectors | **NOT BUILT** |
| Connectors breadth | Gmail, Drive, Slack, Notion, many more | Whole Google Workspace + YouTube + Photos + Search | Gmail, Calendar, Drive, Slack, Notion, M365, Chrome | **LIVE: Gmail + Calendar only.** Drive/Docs/Sheets: BRANCH "soon" (no code). Slack/Notion: NOT BUILT. Instagram/YouTube/bank: IN PROGRESS (second agent, unverified) |
| Bilingual Persian (UI + understanding + RTL) | Speaks Persian (multilingual model); no Persian-first design | Speaks Persian; no Persian-first design | Speaks Persian; no Persian-first design | **LIVE (partial)** — EN/FA toggle + Persian strings on `main`; deterministic Persian intents are BRANCH; open-ended Persian needs the key; Jalali month names not converted |
| Privacy / offline (deterministic, no-LLM paths) | Cloud; memory opt-in | On-device processing for Proactive Assistance; cloud otherwise | Cloud | **LIVE (partial)** — deterministic rule engines, no LLM calls, owner-scoped, fail-closed. Server-side, not on-device; no offline mode |
| Platforms | Web, iOS, Android, macOS, Windows | Android (native core), iOS, web | Desktop macOS/Windows, Linux beta, web, iOS, Android | **Android only (APK).** iOS NOT BUILT; web NOT DEPLOYED (the `/site` route exists in the branch, inside the APK only); desktop NOT BUILT |
| Confirmations + audit trail + idempotency on consequential actions | Confirmations on agent actions; no per-project allowlists | Confirmations on actions | Plan approval in Cowork; folder-scoped | **LIVE** — Bounded Authority: propose→confirm, idempotency keys, audit trail, per-project allowlists (BRANCH). Genuinely stronger than the three on this axis |
| Home-screen design (glassy 3D, waterfall) | Polished consumer apps | Polished consumer app | Polished consumer app | **LIVE: old design.** Mahdi's screenshot 2026-11-26 shows the welcome screen unchanged. Glass system exists in BRANCH; home-screen restyle is IN PROGRESS |

## The ten extras — verified, with the honest downgrades

Checked against the code in the staging area, not the pitch. "None of
the three has it" means: no equivalent feature exists in ChatGPT,
Gemini or Claude as shipped in late 2026.

| # | Extra | Real? | Note |
|---|---|---|---|
| 1 | **Inbox Watch** — Gmail scanned for deadlines/rights/renewals/refunds; proposals go propose→confirm→audit into the Life Graph | Yes — real, none of the three has it | BRANCH, not deployed |
| 2 | **Promise Chaser** — follow-up cadence (T−3 / due / +7 / +14) + draft chase emails, never auto-sent | Yes — real, none of the three has it | BRANCH, not deployed |
| 3 | **Outcome Verifier** — obligation/promise verified against Gmail evidence (verified / awaiting / failed), persisted | Yes — real, none of the three has it | BRANCH, not deployed |
| 4 | **Delay Repay Claim Pack** — one-call estimate + draft + filing deadline (journey+28d) + operator URL + evidence + filing obligation | Half new — the engine is on `main` already; the pack is new packaging | The engine itself is an extra vs the three; the pack is incremental over `main` |
| 5 | **Consumer Rights Case File** — pathway + notice + 30-day / 6-month deadlines stored as a Life Graph case node with guarding obligations | Half new — the engine is on `main` already; persistence as a case node is new | Same note as #4 |
| 6 | **Renewal Guard** — decision deadline (renewal−7d), annual cost parsed from £ amounts, keep/cancel/switch + calendar blocker | Yes — real, none of the three has it | BRANCH, not deployed |
| 7 | **Travel Guard** — calendar trips × Gmail bookings: confirmed / missing_booking / disruption | Yes — real, none of the three has it | BRANCH, not deployed |
| 8 | **Morning Brief** — deterministic daily digest, ranked, EN/FA | **Shared category** — Gemini's Daily Brief is the same idea (announced, US paid beta). EchoMind's is deterministic, ranked by obligation urgency, and bilingual — a different implementation, not a new category | BRANCH, not deployed |
| 9 | **Evidence Locker** — completeness scoring + exportable JSON evidence pack for court / ombudsman / FOS | Yes — real, none of the three has it | BRANCH, not deployed |
| 10 | **Calendar Guard** — overlap + travel-risk detection on the upcoming calendar | Yes — real, none of the three has it | BRANCH, not deployed |

Honest count: **7 of the ten are things none of the three has**
(1, 2, 3, 6, 7, 9, 10). Two are packaging over engines `main`
already had (4, 5 — the engines themselves are still extras vs the
three). One is a shared category (8). Beyond the ten, two more real
edges exist: **Bounded Authority with per-project allowlists +
idempotency + audit trail** (stronger than any of the three's
confirmation flows) and **deterministic Persian intents + RTL +
Vazirmatn** (none of the three is Persian-first — though all three
already answer in Persian fluently).

## The gaps — things the three have that EchoMind lacks

This is the important list. In order of size:

1. **A live frontier model.** The single biggest gap. All three
   answer any open question with a state-of-the-art model. EchoMind
   on the phone today answers from fixed pillar packs — Gemini is
   unconfigured on production. Without this, EchoMind is not a
   general assistant at all; it is a set of fixed wizards plus a
   structured record store.
2. **Natural real-time voice.** Advanced Voice / Gemini Live / Claude
   voice vs Web Speech STT + device TTS. The Gemini-TTS plumbing is
   built but has never run and has no key.
3. **Doing real work with files.** ChatGPT Work/Codex and Claude
   Cowork read, write and produce documents, spreadsheets, decks and
   code. EchoMind can parse an uploaded document; it cannot produce
   or edit a file.
4. **Agent actions beyond three verbs.** ChatGPT Agent books, buys
   and fills forms on the web; Claude Cowork works in your folders,
   runs scheduled tasks and operates the computer; Gemini Spark is
   always-on across Workspace. EchoMind's delegation knows three
   verbs (latest commit, open issues, record an obligation) and its
   live GitHub path is unverified.
5. **Scheduled tasks that actually run.** Claude and ChatGPT run
   jobs in the cloud on a schedule. EchoMind has no scheduler; the
   Promise Chaser only proposes dates.
6. **Connectors.** Gmail + Calendar live, against the three's
   Gmail/Calendar/Drive/Slack/Notion/YouTube/Photos/Workspace.
   Drive/Docs/Sheets are "soon" with no code; Instagram/YouTube/bank
   are being built by a second agent right now, unverified.
7. **Platforms.** Android only. No iOS, no deployed web app, no
   desktop. All three are everywhere.
8. **Proactive always-on presence.** Gemini Spark and ChatGPT's
   always-on agent act without being asked. EchoMind's proactivity
   (Inbox Watch, Morning Brief) is branch-only and not deployed.
9. **Image, video, deep research, code execution.** Entire
   capability families the three ship and EchoMind does not attempt.
10. **Memory that works.** All three have memory feeding a live
    model. EchoMind's memory engine exists, but with no model behind
    it on the phone, it cannot carry a conversation.
11. **Scale and polish.** Production services with uptime, sync
    across devices, and app-store presence vs a single debug APK and
    a one-person backend.

## Verdict — is the claim true?

**No. Not today.**

"We have everything they have, plus ten more" is false on both halves:

- **"Everything they have": false.** EchoMind does not have a live
  model, natural voice, file work, cloud scheduled tasks, broad
  connectors, or more than one platform. Those are not details; they
  are what the three apps *are*. The phone in Mahdi's hand right now
  has fixed-pack chat, the old home screen, and two connectors.
- **"Plus ten more": half true.** Seven of the ten are genuinely
  things none of the three has, and the UK outcome engines (Delay
  Repay, Consumer Rights) are real extras. But all ten live on a
  branch, not on the phone — and one of them (Morning Brief) shares
  its category with Gemini's Daily Brief.

What *is* true, and is the real claim worth making: **EchoMind has a
set of UK outcome engines no big assistant has — obligations detected
from the inbox, promises chased, outcomes verified against evidence,
claims and cases filed with deadlines — behind a stronger authority
model than any of them.** That is a narrower claim than "everything
they have plus ten", and it is the one that can be made honest.

## What would have to be built for the claim to become true

In order — each is a precondition for the next to matter:

1. **Put a model key on production.** One Gemini API key on Railway
   turns fixed-pack chat into open chat. This is the single biggest
   step and the cheapest. Until this is done, no comparison is
   winnable.
2. **Deploy the branch.** Merge `doodombeh/echomind-next` to `main`
   so Railway redeploys and the ten ideas go live. Until then they
   are code, not a product.
3. **Verify the natural voice.** Same key gives Gemini-TTS; listen
   to it before claiming it.
4. **Widen delegation.** More verbs (create issue, open PR, read a
   file, run tests, send email, book) behind the same allowlists, and
   a live GitHub token so the executor is verified end to end.
5. **Finish the connectors.** Drive/Docs/Sheets, then the
   Instagram/YouTube/bank work already in progress — with real
   status, never a mock checkmark.
6. **Add cloud scheduled tasks** so promises and briefs execute on
   their own, not only when the app is open.
7. **Ship iOS and the deployed web app.** One platform cannot beat
   apps that are everywhere.
8. **Then re-run this comparison.** Even after all of that, the
   honest claim stays narrower than "everything": image/video
   generation, deep research and code execution remain out of scope
   by design. The defensible claim is: *everything they have for the
   job of finishing your life's obligations — plus ten things they
   don't.*

## Verification (this task)

- Production probed live 2026-11-26: `/api/v1/health` healthy;
  `/api/v1/ready` Gemini unconfigured. This is what the phone
  actually talks to.
- Backend tests re-run on an overlay of `main` + the staging area
  (venv `~/workspace/echomind/.verify-venv`):
  **135 passed, 0 failed**, excluding the second agent's in-progress
  connector tests (Instagram / YouTube / TrueLayer-bank), of which 2
  YouTube tests fail. Those failures belong to work in progress, not
  to the world-best build. (The world-best report claimed 129 passed;
  my run covers the same code plus files added since, so the counts
  differ — the suite itself passes.)
- No repo code was modified, nothing was pushed, the branch was not
  touched. This task produced this document only.

## Sources

- ChatGPT 2026: theaiinsider.net ChatGPT review (updated 23 Jun
  2026); learn.techwithdarin.com ChatGPT field guide (updated Sep
  2026); greverse.com; vantaige.io Atlas review; saleshive.com.
- Gemini 2026: 9to5google.com, "Gemini rolling out 'Personal
  Intelligence'" (14 Jan 2026); theoutpost.ai, Proactive Assistance
  (Google app beta 17.18); dev.to, "Google Expands Gemini Live With
  Daily Brief, Spark Agent and Workspace Context"; refontelearning.com.
- Claude 2026: dev.to, "How to Use Claude in 2026" (Cowork, memory,
  connectors, scheduled tasks); pandromeda.com, Cowork pricing &
  features; tailkits.com (reviewed 12 Nov 2026); techsy.io, Cowork
  guide (GA 9 Apr 2026).
- EchoMind: repo `main` HEAD `7565ead` (AGENTS.md, DEPLOY.md,
  `backend/app/services/*`, `backend/app/api/endpoints/*`,
  `frontend/src/app/*`); staging area docs (`world-best-ten.md`,
  `top-10-research.md`, `persian.md`, `project-delegation.md`,
  `connections-hub.md`, `website.md`, the ten idea docs); live
  production endpoints above.
