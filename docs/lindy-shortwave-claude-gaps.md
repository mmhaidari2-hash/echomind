# EchoMind vs Lindy / Shortwave / Claude — the gaps, and what was built

Mahdi's framing (2026-11-26): **"Why should a customer choose us? Ten
reasons that we still don't have — add those reasons."**

This doc is the answer. The ten reasons are customer-facing: each one is
something a customer would pick EchoMind for. Six are built in this run
(deterministic, no new dependencies, no key needed, owner-scoped,
fail-closed). Four are still missing, and each one names the exact thing
Mahdi must supply — nothing here is faked.

Research: Lindy (lindy.ai), Shortwave (shortwave.com) and Claude
(claude.ai + Claude Code) from their own pages and 2026 reviews, checked
2026-11-26. EchoMind's side is read from the code (main HEAD 7565ead +
branch `doodombeh/echomind-next`, commit 3e4e311), not from claims.

## The ten reasons

| # | Reason a customer would choose EchoMind | Status |
|---|------------------------------------------|--------|
| 1 | **It finds a deadline hiding in a 3-year-old email — before you miss it.** Shortwave searches the whole archive; EchoMind only scanned the last 30 days. | **BUILT** — archive search (`GET /life/mail/search`, Gmail syntax: keywords, `from:`, `after:`, `has:attachment`) + archive deep-scan (`POST /life/mail/scan-archive`) that runs the Inbox Watch detectors over the matches. Honest limit: ranking is Gmail's own, not semantic — semantic search needs the Gemini key (see still-missing 1). |
| 2 | **It puts an email to sleep and wakes it up exactly when you need it.** Shortwave's snooze. | **BUILT** — snooze (`POST /life/mail/snooze`): parks the email, creates an obligation due on the chosen date with the message as evidence; cancelling the snooze cancels the obligation. |
| 3 | **It notices you sent an email and nobody replied — and lines up the chase for you.** Shortwave fires follow-up reminders on unanswered mail. | **BUILT** — unanswered-mail detector (`GET /life/mail/unanswered`): sent threads with no reply for N days, each with a follow-up draft (EN/FA). Nothing is sent — the draft is a proposal. |
| 4 | **It does the work inside your GitHub project — opens the issue, reads the file, opens the pull request, checks the build.** Claude Code's territory. | **BUILT** — four new delegation verbs, all through propose → confirm → run with per-project allowlists: `github.create_issue`, `github.read_file`, `github.open_pr`, `github.ci_status`. Planner extracts the title / path / branches from Persian or English. Writes fail closed without a token (see still-missing 4). |
| 5 | **It watches for things while you sleep and proposes the next step — nothing happens until you say yes.** Lindy's triggers, but deterministic. | **BUILT** — scheduled watches (`/watches`): trigger (`gmail_query`, `promise_overdue`, `unanswered_mail`) + condition + action (`create_obligation`, `draft_followup`). Evaluation produces proposals with evidence; accepting one creates an obligation (draft in its notes). The runner is the gap: something must call `POST /watches/evaluate-all` on a schedule (see still-missing 3). |
| 6 | **It finds any file in your Drive and quotes what it says.** Claude's Drive connector. | **BUILT** — Drive connector (`/connectors/drive`): search by name/content, read Google Docs (exported as text) and plain-text files, capped at 8,000 chars. Unreadable types (images, PDFs, sheets) are refused with the reason, never guessed. Live use needs the Drive API enabled + the scope granted (see still-missing 5). |
| 7 | **It speaks Persian like a human — in chat and by voice.** | **STILL MISSING** — needs Mahdi's **Gemini API key** (set as `GEMINI_API_KEY` on the Railway backend). What exists today: the deterministic Persian intent layer (structured requests in Persian/English, no key) and voice plumbing (device STT → same pipeline; TTS falls back to device speech). What does not exist: open-ended Persian at Muse's level and the natural Persian voice (Gemini-TTS, same key). |
| 8 | **It books the hotel and the flight for you — and stops before the payment so you approve it.** The cloud-browser-agent pattern (ChatGPT Agent/Operator). | **STILL MISSING** — needs a **booking provider + a virtual card with a spending cap + a cloud browser runner**. EchoMind has travel quotes and one-tap confirm tokens, but no booking execution and no payment rail. |
| 9 | **It writes the code, runs the tests and fixes what breaks — inside your project.** Claude Code's core. | **STILL MISSING** — needs a **sandboxed code runner + a frontier-model key + a security decision** on code execution. The deterministic slice is built (reason 4: issue / file-read / PR / CI status). Writing code, running tests and fixing bugs is not attempted here — doing it without a sandbox would break the repo's own security rules. |
| 10 | **It sits in your meetings, takes the notes and files the action items.** Lindy's meeting workflow. | **STILL MISSING** — needs a **meeting provider (Google Meet / Zoom bot or call recording) + transcription**. No provider and no key exist for this yet. |

## Detailed comparison

### Lindy (lindy.ai) — the "AI employee" for follow-ups

Lindy in 2026: no-code agents built by describing a task in plain
English; triggers (new email, calendar event, Slack mention, webhook,
call) + steps (send email, update CRM, call); human-in-the-loop
approvals before external sends; 1,000+ integrations + MCP; computer
use (browser automation) on Pro and up; meeting recording, notes and
action items; scheduled routines; credit billing (Plus $49.99/mo, Pro
$99.99/mo, Max $199.99/mo; no free tier since the early-2026 repricing).

| Lindy capability | EchoMind before | EchoMind now |
|---|---|---|
| Triggers that run in the background | Nothing scheduled — detectors only ran on tap | **Watches** (reason 5). Runner still needs deployment |
| Human-in-the-loop approval | Already had: Bounded Authority (propose → confirm → execute, idempotency, audit) | Unchanged — the watches accept step uses the same path |
| Email triage + drafting | Inbox Watch (triage) had; drafts via Promise Chaser had | Unchanged |
| Drafting in your voice | Not had | Still missing — needs the Gemini key |
| Meeting notes + action items | Not had | Still missing — reason 10 |
| Natural-language agent building | Not had | Still missing — needs the Gemini key |
| Computer / browser use | Not had | Still missing — needs a cloud browser runner |
| 1,000+ integrations | 8 connectors (Gmail, Calendar, Drive/Docs/Sheets, Bank, Instagram, YouTube) | Unchanged in count; Drive is now real (reason 6) |

### Shortwave (shortwave.com) — the email-archive hunter

Shortwave in 2026: AI email client for Gmail; natural-language search
over the full archive and attachments; AI summaries (tl;dr) on every
thread; AI filters in plain English; smart snooze; follow-up reminders
when nobody replies; todos/stars/bundles/splits; read statuses and link
tracking; scheduling; Tasklet for 24/7 triggers; MCP. Pricing tiers
Business / Premier / Max; models Claude Haiku 4.5 → Opus 4.6.

| Shortwave capability | EchoMind before | EchoMind now |
|---|---|---|
| Full-archive search | 30-day scan only | **Archive search + deep scan** (reason 1) |
| Semantic / natural-language search | Not had | Still missing — needs the Gemini key |
| Snooze + smart resurface | Not had | **Snooze** (reason 2) |
| Follow-up reminders on unanswered mail | Promise Chaser had cadence, but no detection of "no reply" | **Unanswered detector** (reason 3) |
| AI summaries (tl;dr) | Not had | Still missing — needs the Gemini key |
| AI writing in your voice | Not had | Still missing — needs the Gemini key |
| Todos / stars / bundles / splits | Obligations ≈ todos (had); no email-client UI | Unchanged — EchoMind is not an email client, by design |
| Attachment analysis (PDF/code) | Uploads are parsed; Gmail attachments are not | Partial — unchanged in this run |

### Claude (claude.ai + Claude Code) — real work inside projects

Claude in 2026: chat on web/desktop/mobile; MCP connectors (Gmail:
search/read/draft, send approval-gated; GitHub: read file names,
contents and branches — no PRs, issues or commit history, Anthropic
points you to Claude Code for those); Projects with reference files;
Artifacts; Claude Code (terminal agentic coding: full codebase context,
multi-file edits, test execution, git automation, PRs, CI headless
mode, skills); Claude Coworker (desktop-only agent, Pro $20/mo).

| Claude capability | EchoMind before | EchoMind now |
|---|---|---|
| Read files / repos | 3 verbs: latest commit, open issues, obligation | **+ read file, CI status** (reason 4) |
| Create issues / PRs | Not had | **+ create issue, open PR** (reason 4) |
| Write code, run tests, fix bugs | Not had | Still missing — reason 9 |
| Gmail connector | Had (OAuth, read + send via Bounded Authority) | + in-thread replies (`POST /life/mail/{id}/reply`: threadId + In-Reply-To/References) |
| Drive connector | "Soon" | **Drive search + read** (reason 6) |
| Notion connector | Not had | Still missing — feasible next build, no key needed (OAuth app) |
| Cross-app workflows in one chat | Delegation plans could mix GitHub + Life steps | + watch actions span Gmail + Life Graph (reason 5) |
| Artifacts / docs / sheets generation | Not had | Still missing — needs the Gemini key |
| Always-on background presence | Only when the app is open | Watches built; runner needs deployment (reason 5) |

## What was built in this run

Backend + docs + tests only (no frontend files were touched).

| Capability | Files |
|---|---|
| Archive search + deep scan | `services/google_connector.py` (`search_gmail`), `services/detection.py` (`scan_archive`), `api/endpoints/mail.py` |
| Snooze | `schemas/mail.py`, `services/mail.py` (`snooze_email`, `list_snoozes`, `cancel_snooze`) |
| Unanswered-mail chase | `services/mail.py` (`find_unanswered`), `services/google_connector.py` (`gmail_thread`, `gmail_profile_email`) |
| In-thread replies | `services/google_connector.py` (`reply_gmail`), `schemas/connectors.py` (`thread_id`, `in_reply_to`, `message_id_header`) |
| Scheduled watches | `schemas/watches.py`, `services/watches.py`, `api/endpoints/watches.py` |
| Drive connector | `schemas/drive.py`, `services/drive_connector.py`, `api/endpoints/drive.py` |
| Delegation verbs | `services/delegation.py` (`github.create_issue`, `github.read_file`, `github.open_pr`, `github.ci_status`, `_github_write`, planner extraction), `schemas/projects.py` (`TaskStep.params`, wider default allowlist) |
| Chat wiring | `services/intent.py` (`mail_search` intent, EN/FA), `services/pillars.py` (mail-search reply branch) |
| Routing | `api/v1/router.py` (mail, watches, drive) |

Verification: full backend suite on a repo copy overlaid with the
staging tree — **188 passed, 0 failed** (147 before + 41 new).
New tests: `test_mail_search_snooze.py`, `test_watches.py`,
`test_delegation_verbs.py`, `test_drive_connector.py`,
`test_intent_mail_search.py`.

Design rules kept: deterministic rules, no LLM, no new dependencies,
owner-scoped JSON stores, fail-closed on missing auth/scope/token,
nothing sends without confirmation (watches propose, the owner
accepts; replies and issue/PR creation run only after task
confirmation). Existing projects keep their old allowlist — the four
new tools are in the default for new projects only; the owner adds
them to an old project by editing its `allowed_tools`.

## Still missing — the exact thing Mahdi must supply

1. **Gemini API key** (`GEMINI_API_KEY` on the Railway backend) —
   live open-ended chat, natural Persian voice (Gemini-TTS), semantic
   email search, AI summaries, AI writing in your voice,
   natural-language agent building, artifacts/docs generation. One key
   unlocks all of these; none of them is faked in the meantime.
2. **Merge `doodombeh/echomind-next` → main** so Railway redeploys —
   until then the new endpoints (mail, watches, Drive) and the watches
   runner cannot work on the phone; the APK talks to the old backend.
3. **A scheduled runner for watches** — a Railway cron or a GitHub
   Actions schedule calling `POST /watches/evaluate-all`. No new key;
   needs the merge first (item 2).
4. **GitHub token (`GITHUB_TOKEN`, `repo` scope)** — only for
   private-repo delegation and for the write verbs (create issue, open
   PR). Public-repo reads work without it.
5. **Drive API enabled on the Google Cloud project + granting the
   `drive.readonly` scope at sign-in** — the Drive connector is built;
   the live connection needs this one setup step (same as YouTube).
6. **Booking provider + virtual card with spending cap + cloud
   browser runner** — for bookings that stop before payment (reason 8).
7. **Sandboxed code runner + security decision** — for code writing
   and test running inside projects (reason 9).
8. **Meeting provider + transcription** — for meeting notes (reason 10).
9. **iOS + deployed web** — Android only today; the website route
   (`/site`) exists but is not deployed.
10. **Notion / Slack connectors** — feasible next builds, no key
    needed (OAuth apps), not built in this run.

## Differentiation checkpoint (repo AGENTS.md)

"Why can EchoMind deliver this outcome better than a large incumbent
with more money and staff?" — the new capabilities strengthen the
existing answer rather than replacing it: watches are deterministic
rules over the owner's own data, so they cannot hallucinate a deadline
or send the wrong chase (Lindy's LLM agents can); the archive search,
snooze and unanswered detector are the same deterministic engine as
Inbox Watch, extended to the whole mailbox; delegation verbs are
allowlisted per project, so "do it in my project" cannot touch a tool
the owner never approved. The UK outcome engines (Delay Repay,
consumer rights, renewal/travel guards) remain the part none of the
three competitors has.
