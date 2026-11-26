# Project delegation — "go do this in my such-and-such project"

Mahdi's north star (2026-11-26): "بگم برو تو فلان پروژم اینو انجام
بده" — say "go do this in my such-and-such project" — and EchoMind
should be able to do, in general, whatever HE can do. "بتونه کلا
هرکاری که من بتونم بکنم اونم بتونه."

## The architecture

### 1. Project registry (`services/projects.py`)
One owner-scoped JSON store (same pattern as the Life Graph store).
A project: `name`, `kind`, `identity` (the agent name Mahdi gave it —
Doodombeh for the launcher, ...), `repo` (owner/repo), `branch`,
`allowed_tools` (the per-project Bounded Authority boundary),
`notes`. Persian names resolve via an explicit alias table
(اکومایند → EchoMind, اپ‌سازی → appsazi, لانچر →
orbit-shell-launcher) because transliteration does not bridge scripts.

### 2. Task lifecycle (`services/delegation.py`)
`proposed → confirmed → running → done | failed | needs_owner`.
- **Nothing runs before confirmation.** A task is born `proposed`.
  The executor only runs after `POST /projects/tasks/{id}/confirm`.
- **Nothing runs beyond the allowlist.** Every planned step names a
  tool; a tool not in the project's `allowed_tools` is refused and the
  task ends `needs_owner` with the reason written down.
- **Nothing is claimed without evidence.** Every step records what it
  did (or why it could not), and the task result quotes the evidence.
  A step that cannot be verified is reported as not done, never as
  done.
- **Confirming is idempotent**: confirming a finished task changes
  nothing. Tasks carry an idempotency key; creating the same task
  twice with the same key returns the same task.
- **Chat confirmation**: the owner can also confirm by replying
  "تایید" / "confirm" in chat — the intent layer confirms the most
  recent proposed task. The task id is also returned in the chat
  reply's metadata for a future UI button.

### 3. Planner (deterministic)
Recognises the verbs it knows and turns the rest into an explicit
`needs_owner` step that says what is missing. It never invents a
capability.
- "latest commit" / "آخرین کامیت" → `github.latest_commit`
- "open issues" / "issue" → `github.open_issues`
- "remind" / "obligation" / "یادآوری" / "مهلت" → `life.create_obligation`
  (recorded in the Life Graph, tagged with the project name)
- anything else → `owner` step (needs the owner)

### 4. Executor
- **GitHub steps** call the public GitHub API with urllib (no new
  dependency, no token by default). A `GITHUB_TOKEN` env var, when
  set, is sent as a Bearer token — it lifts the unauthenticated rate
  limit (60/hour on a shared egress IP) and opens private repos.
  Without one, public repos work until the limit is hit and private
  repos fail closed as `needs_owner` ("GitHub returned HTTP 403/404 —
  the repo is private or unreachable without access").
- **Life Graph steps** call the existing `add_obligation` service.

## What EchoMind can DO now across projects
- Register projects and list them, owner-scoped.
- Take "do X in project Y" from chat (Persian or English, typed or
  spoken) and propose a concrete plan with named steps.
- On confirmation, run the plan: check a repo's latest commit, list
  its open issues, record a project-tagged obligation — and report
  back with the evidence (commit hash + message, issue titles,
  obligation id).
- Refuse anything outside the project's allowlist, and say exactly
  what it needs (access, a tool, the owner) when it cannot do a step.

## What is architecture-ready (not built yet)
- More executor tools (create an issue, open a PR, read a file,
  run the test suite) — each is one planner verb + one executor
  branch + one test, behind the same allowlist.
- Per-project credentials (a GitHub token per project, stored
  server-side, never in the client).
- A Projects UI surface (api.ts clients exist: `listProjects`,
  `createProject`, `createProjectTask`, `getProjectTask`,
  `confirmProjectTask`); the chat path is the working UI today.
- Cross-project memory (which project a promise belongs to, per
  project obligation views) — the obligation `source: "delegation"`
  and the `[Project]` title prefix are the hooks.

## What still needs Mahdi
- A GitHub token (classic PAT or fine-grained, `repo` scope) if he
  wants private-repo tasks (e.g. orbit-shell-launcher) to run — set
  as `GITHUB_TOKEN` in the backend environment. Public repos work
  without one, subject to the rate limit.
- Creating the first projects (or one seed project) — the registry
  starts empty; there is no auto-discovery of his ~32-38 repos yet.
- Approval per new executor tool (each new tool is a new capability
  the owner explicitly allows per project).

## Honest limits (verified this run)
- The live GitHub call from this VM returns HTTP 403 (shared-egress
  rate limit, no token) and fails closed as designed. The executor
  logic is verified with stubbed HTTP (tests pass); the live path
  from the deployed backend is UNVERIFIED here and needs CI or a
  token to confirm.
- The planner knows three verbs. Everything else is `needs_owner`
  by design — that is the safety boundary, not a bug, and the report
  says so instead of pretending.

## Verify
```bash
pytest backend/tests/test_projects.py backend/tests/test_intent_chat.py -q
```
Checks: registry CRUD + owner scoping, task proposed-until-confirmed,
plan execution with evidence (stubbed GitHub), idempotent confirm,
unknown instruction → needs_owner, allowlist refusal, private repo
→ needs_owner with the 403 evidence, token header when configured,
endpoint owner scoping.
