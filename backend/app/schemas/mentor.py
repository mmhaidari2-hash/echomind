"""Schemas for the EchoMind → command-hub connection.

The hub slot is GENERIC and pluggable, not MENTOR-only: for
Mahdi the slot is MENTOR; for anyone else it stays empty and
they plug in whatever hub they like. One configurable hub kind
("mentor-hub") with a user-set endpoint.

MENTOR is the reference hub — Mahdi's command centre for all
his projects, connected via API + GitHub to all his agents,
working on his command. Its production app is
https://mentor-web-production-096b.up.railway.app, and it is
the pre-filled example in the UI. There is NO public JSON task
API and NO MCP server in MENTOR. The one real delegation entry
is its owner-only dashboard form: POST {endpoint}/app/agents
with form fields repo, instruction, engine. It creates an
AgentTask and redirects to /app/agents/{id}; results come back
as a GitHub PR/branch and the owner confirms — no auto-merge.
The dashboard is session-authenticated (GitHub OAuth), so
EchoMind stores the owner's hub session cookie encrypted
server-side, exactly like the other connector tokens. The
cookie is never returned to the client — the connection only
reports whether one is stored and whether it still works.

Another hub can be plugged into the same slot as long as it
speaks the same form (repo + instruction + engine, redirect
to /app/agents/{id}); the endpoint is whatever the owner sets.
Nothing in the code assumes the hub is MENTOR.
"""

from pydantic import BaseModel, Field

# Mahdi's hub — the pre-filled example, NOT a hardcoded
# default. A fresh slot stays empty until its owner sets an
# endpoint.
MENTOR_PRODUCTION_URL = "https://mentor-web-production-096b.up.railway.app"

# Engines the MENTOR dashboard form accepts (web/agents_ui.py).
MENTOR_ENGINES: tuple[str, ...] = (
    "auto",
    "codex",
    "cursor",
    "routine",
    "codex_auto",
    "claude_routine",
    "claude_routine_manual",
)


class MentorConnection(BaseModel):
    # Empty until the owner plugs a hub in.
    endpoint: str = ""
    cookie_name: str = "session"
    has_session: bool = False
    # True = the stored session still opens the hub; False = it was
    # rejected (sign in again); None = never checked / hub
    # unreachable, so unknown rather than guessed.
    session_valid: bool | None = None
    # True = the hub's own pages say its agents are paused (new
    # tasks stay queued until a worker is enabled); False = no
    # pause shown; None = unknown (no session, or hub unreachable).
    paused: bool | None = None
    # ready | paused | unknown | needs-sign-in | empty
    worker_state: str = "unknown"
    detail: str | None = None


class MentorSessionUpdate(BaseModel):
    endpoint: str | None = Field(default=None, max_length=300)
    # The MENTOR session cookie value, copied from the owner's
    # signed-in browser. Stored encrypted, never returned.
    session_cookie: str | None = Field(default=None, max_length=2000)
    cookie_name: str | None = Field(default=None, max_length=80)
    clear: bool = False


class MentorTaskStatus(BaseModel):
    task_id: str
    # queued | running | waiting-for-you | ready-to-merge | finished | unknown
    state: str
    detail: str | None = None
    url: str
    paused: bool | None = None
