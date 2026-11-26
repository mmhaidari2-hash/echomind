# Command hub — the generic, pluggable slot (MENTOR is Mahdi's hub)

## The product rule

EchoMind will go to market as a mobile assistant for customers
who do NOT have MENTOR. So the hub slot is GENERIC and
pluggable, not MENTOR-only: for Mahdi the slot is MENTOR; for
anyone else it stays EMPTY and they plug in whatever hub they
like. The point is hands-free voice commands — otherwise he
could just go to the hub directly.

- **Kind** (`schemas/projects.py`): `"mentor-hub"` — one
  configurable hub kind with a user-set endpoint.
- **The slot starts empty.** No endpoint is assumed and no hub
  is required. A fresh user sees "No hub connected yet" and
  plugs in any hub they like.
- **MENTOR is the reference hub, pre-filled for Mahdi** — its
  production app is `https://mentor-web-production-096b.up.railway.app`
  and that URL is the placeholder in the Hub panel. Nothing in
  the code assumes the hub is MENTOR: any hub speaking the same
  form (repo + instruction + engine, redirect to
  `/app/agents/{id}`) can be plugged into the same slot.

## What MENTOR is

Mahdi's command centre for all his projects — connected via
API + GitHub to all his agents, working on his command. A user
builds an app with Lovable, Replit, Cursor or Claude Code;
MENTOR reviews it before it takes real money or data, explains
problems in plain Persian, and fixes it. Repo:
`mmhaidari2-hash/MENTOR` (private, main, latest commit
`fc1c4b8`, 28 Oct 2026). Scanner `mentor-scan` v0.2.0
(CLI `mentor scan` → Persian HTML report, score 0–100) plus a
full FastAPI dashboard / agent command centre (`web/`) and an
hourly autopilot loop.

## The exact route used (wired, 2026-11-26)

There is NO public JSON task API and NO MCP server in MENTOR.
The one real delegation entry is its owner-only dashboard form:

```
POST {endpoint}/app/agents
  Content-Type: application/x-www-form-urlencoded
  Cookie: session=<owner's session cookie>
  fields: repo, instruction, engine
    engine ∈ auto, codex, cursor, routine, codex_auto,
             claude_routine, claude_routine_manual
  → 302/303 to /app/agents/{id}   (the AgentTask was created)
  → 409 when a task is already active for that repo
  → 401/403 when the session is dead
```

Results come back as a GitHub PR/branch (`mentor/codex-{task_id}`)
and the owner confirms — no auto-merge. Status is read from
MENTOR's own pages, because there is no JSON status API:
`/app/agents/{id}/check` (fallback `/app/tasks/{id}`) for one
task, `/app/agents` for the worker state. MENTOR returns HTML,
so states are matched from page text and reported as
`"unknown"` when the page shows no recognisable state — never
guessed. States: `queued`, `running`, `waiting-for-you`,
`ready-to-merge`, `finished`, `unknown`.

What is deliberately NOT used: `POST /api/bridge/claim` and
`POST /api/bridge/tasks/{id}/result` are OUTBOUND — MENTOR
delegating work out to a Codex installation. They cannot create
a task, so they are not an inbound route and are never called.

## Auth — the session cookie

The dashboard is session-authenticated (GitHub OAuth), so
EchoMind stores the owner's hub session cookie encrypted
(Fernet, same `CONNECTOR_TOKEN_KEY` as the other connectors),
server-side only, in `data/mentor.json`. It is NEVER returned
to the client — the Hub panel only reports whether one is
stored (`has_session`) and whether it still works
(`session_valid`). How the owner gets it: sign in to the hub
in the browser, copy the session cookie, paste it into the Hub
panel. Without a stored session the executor fails closed
with "Hub sign-in is missing" — it never fakes a submission.

## How the executor works

- **Kind** (`schemas/projects.py`): `"mentor-hub"` defaults
  to `MENTOR_HUB_TOOLS` — `mentor.delegate` plus read-only
  GitHub verbs (`latest_commit`, `open_issues`, `ci_status`)
  and `life.create_obligation`. No direct write verbs: writing
  goes through the hub, gated on the owner's confirmation.
- **Planner** (`services/delegation.py`): on a mentor-hub
  project, any instruction no other verb matches becomes one
  `mentor.delegate` step carrying the instruction and the
  engine (extracted from the instruction — "with codex" →
  `codex`, otherwise `auto`). Known verbs still plan as
  themselves. On an ordinary project, an unmatched instruction
  is still the `owner` step — the hub is not a fallback for
  projects that are not the hub.
- **Executor** (`services/mentor.py::submit_task`): checks the
  allowlist first, then the endpoint (project override, else
  the stored connection), then the session, then the repo.
  Every missing piece fails closed as `needs_owner` with the
  exact missing piece. A 302 to `/app/agents/{id}` is the
  only success — the step evidence quotes the task id and URL.
  A 200 without a redirect is NOT claimed as done.
- **Paused workers**: MENTOR's own pages say when its agents
  are paused. A submitted task is still accepted and queued;
  the step evidence says so ("the hub's agents are paused, so
  this stays queued until a worker is enabled") instead of
  pretending it is running. The Hub panel shows the same state.
- **Persian name**: "منتور" resolves to the hub project in
  `find_project_by_name`, like اکومایند → EchoMind.

## What is NOT built (and why it is honest to say so)

**The HUB.md file route is unimplemented.** MENTOR's hourly
autopilot reads a file-based inbox (`HUB.md`: `commands` /
`waiting` / `chatmsgs` collections) — that would let EchoMind
hand work over by writing to the repo. But the private repo
returns 404 to the API tools available here, so the exact
inbox format could not be verified, and it is not guessed.
The dashboard form above is the route that is wired instead.

**Exact question for Mahdi, if the HUB.md route is ever
wanted:** what is the exact format of one entry in `HUB.md`
under `commands` (fields, and where the reply goes in
`reports`)? With that, the file route can be added as a
fallback that writes through the GitHub API (needs his GitHub
token, `repo` scope).

## What still needs Mahdi

1. **Hub sign-in** — his MENTOR session cookie, pasted into
   the Hub panel (and the endpoint, if it is not the
   pre-filled MENTOR URL). Until then every delegate step
   fails closed as "Hub sign-in is missing".
2. **The merge** — none of this is live on the phone until
   `doodombeh/echomind-next` is merged (merge decision still
   unanswered).
3. **GitHub token** (`repo` scope) — for private-repo
   delegation verbs and for the HUB.md route, if wanted.
4. **Worker enabled in MENTOR** — task execution is currently
   PAUSED in MENTOR ("Agents paused", seen in his screenshots
   2026-11-26). New tasks queue until a worker is enabled.

## Tests

- `backend/tests/test_mentor_plugin.py` (9 tests): hub
  default tools (no write verbs), `endpoint_url` storage,
  planner routes an unknown instruction to `mentor.delegate`,
  known verbs stay themselves, ordinary projects still get
  the `owner` step, confirm without a hub fails closed,
  confirm without a session fails closed with sign-in,
  allowlist refusal, Persian alias resolution.
- `backend/tests/test_mentor_connection.py` (23 tests): the
  slot starts empty; the dashboard form POST and its 302 →
  task id; busy (409) and expired session (401) fail closed;
  a 200 without a redirect is not claimed; paused workers are
  reported, not hidden; engine extraction and fallback to
  `auto`; status-page text mapped honestly (including
  `unknown`); any hub endpoint can be plugged in
  (`https://hub.example.test` submits there); the API status
  and session endpoints. Every HTTP call is stubbed — no live
  call to MENTOR has run yet.
