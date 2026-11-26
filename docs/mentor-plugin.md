# MENTOR as an EchoMind plugin — the "mentor-hub" project kind

Mahdi redirected 2026-11-26 ~18:36 GMT: drop the SparkFlow plugin —
just build MENTOR, because MENTOR is itself connected to all his
projects. So the project plugin is MENTOR, not SparkFlow.

MENTOR is Mahdi's own app (purple M icon on his phone) that is
itself connected to all his projects. EchoMind registers it as **one
hub entry** in the delegation registry: anything EchoMind cannot do
itself is handed to MENTOR as one gated step, under the same
propose → confirm → run lifecycle and the same Bounded Authority
allowlist. EchoMind proposes, the owner confirms, MENTOR does the
work.

## What was built

- **Kind** (`schemas/projects.py`): `"mentor-hub"`. A project of
  this kind defaults to `MENTOR_HUB_TOOLS` — `mentor.delegate` plus
  read-only GitHub verbs (`latest_commit`, `open_issues`,
  `ci_status`) and `life.create_obligation`. No direct write verbs:
  writing goes through MENTOR, gated on the owner's confirmation.
- **Planner** (`services/delegation.py`): on a mentor-hub project,
  any instruction no other verb matches becomes one
  `mentor.delegate` step carrying the instruction in `step.params`.
  Known verbs still plan as themselves ("check the latest commit"
  → `github.latest_commit`). On an ordinary project, an unmatched
  instruction is still the `owner` step — MENTOR is not a fallback
  for projects that are not the hub.
- **Executor**: the `mentor.delegate` step checks the allowlist
  first (a project without the tool refuses it), then the endpoint.
- **Persian name**: "منتور" resolves to the MENTOR project in
  `find_project_by_name`, like اکومایند → EchoMind.
- **New field**: `endpoint_url` on `ProjectCreate` (max 300 chars)
  — MENTOR's endpoint/URL. Required before any mentor step can run.

## What is NOT built (and why it is honest to say so)

**MENTOR's endpoint is not known, and no MENTOR repo exists under
`mmhaidari2-hash`:**

- Public GitHub search `mentor user:mmhaidari2-hash` returned **0
  results** (checked 2026-11-26 via the public API).
- His public repo list (10 repos: `-British-life`,
  `another-breath`, `artkingbit`, `deep-evidence-inspector`,
  `echomind`, `memorybridge`, `orbit-shell-launcher-fixed`,
  `the-toms`, `the-toms-preview`, `UltimateFitnessApp`) has no
  match.
- MENTOR is an app on his phone, like SparkFlow — not a repo found
  anywhere verifiable.

So the **endpoint is a required but EMPTY field**. With no endpoint,
the step fails closed as `needs_owner` with the exact missing
piece — "MENTOR's endpoint is missing — tell EchoMind where MENTOR
lives (URL/endpoint)". With an endpoint linked, the step still fails
closed as `needs_owner` — "MENTOR is linked (…) but EchoMind does
not yet know how to call it. Supply how MENTOR accepts delegated
work (API shape)". Nothing is sent to MENTOR until the call shape
is known **and** the owner confirms the step. No URL was invented,
no repo was claimed.

## What still needs Mahdi

1. **Where MENTOR lives** — its URL/endpoint. This is the one
   missing fact; everything else is built.
2. **How MENTOR accepts delegated work** — the API shape (endpoint
   path, auth, request/response) — so the delegate step can actually
   call it instead of gating.
3. **The merge** — none of this is live on the phone until
   `doodombeh/echomind-next` is merged (merge decision still
   unanswered).

## Tests

`backend/tests/test_mentor_plugin.py` (9 tests): mentor-hub default
tools (no write verbs), `endpoint_url` storage, planner routes an
unknown instruction to `mentor.delegate`, known verbs stay
themselves on a mentor-hub project, ordinary projects still get the
`owner` step, confirm without an endpoint fails closed with the
missing-endpoint message, confirm with an endpoint fails closed
until the call shape is known, allowlist refusal, Persian alias
resolution.
