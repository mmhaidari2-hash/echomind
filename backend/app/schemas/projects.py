"""Schemas for the project registry and task delegation.

A project is one of Mahdi's ~32-38 projects, each with its own identity
and context. A task is "do X in project Y": it is proposed, the owner
confirms it, it runs, and it reports back with evidence. Nothing runs
before confirmation, nothing runs beyond the project's allowed tools.
"""

from datetime import datetime

from pydantic import BaseModel, Field, model_validator

# Known project kinds. "app" is any ordinary project; "mentor-hub"
# is Mahdi's MENTOR — the app on his phone that is itself connected
# to all his projects. EchoMind hands work it cannot do itself to
# MENTOR as one gated step. Other kinds are accepted but get the
# default tool set.
PROJECT_KINDS: tuple[str, ...] = ("app", "mentor-hub")

# Default tools for an ordinary project.
DEFAULT_TOOLS: list[str] = [
    "life.create_obligation",
    "github.latest_commit",
    "github.open_issues",
    "github.create_issue",
    "github.read_file",
    "github.open_pr",
    "github.ci_status",
]

# Default tools for a MENTOR hub project. One delegation tool —
# mentor.delegate — plus read-only GitHub verbs and the obligation
# verb. No direct write verbs: writing goes through MENTOR, gated on
# the owner's confirmation.
MENTOR_HUB_TOOLS: list[str] = [
    "mentor.delegate",
    "github.latest_commit",
    "github.open_issues",
    "github.ci_status",
    "life.create_obligation",
]


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    kind: str = Field(default="app", max_length=40)
    identity: str | None = Field(default=None, max_length=80)
    repo: str | None = Field(default=None, max_length=160)
    # MENTOR's endpoint/URL for mentor-hub projects. Required before
    # any mentor step can run; left empty until the owner supplies
    # where MENTOR lives.
    endpoint_url: str | None = Field(default=None, max_length=300)
    branch: str | None = Field(default=None, max_length=80)
    allowed_tools: list[str] | None = Field(default=None)
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _default_tools(self) -> "ProjectCreate":
        if self.allowed_tools is None:
            if self.kind == "mentor-hub":
                self.allowed_tools = list(MENTOR_HUB_TOOLS)
            else:
                self.allowed_tools = list(DEFAULT_TOOLS)
        return self


class Project(ProjectCreate):
    id: str
    created_at: datetime
    updated_at: datetime


class TaskStep(BaseModel):
    tool: str
    summary: str
    status: str = "pending"
    evidence: str | None = None
    # Parameters the planner extracted from the instruction (issue
    # title, file path, PR branches). Shown to the owner with the plan
    # so they can see exactly what will run before confirming.
    params: dict[str, object] = Field(default_factory=dict)


class TaskCreate(BaseModel):
    instruction: str = Field(..., min_length=1, max_length=2000)
    language: str = Field(default="en", pattern="^(en|fa)$")
    idempotency_key: str | None = Field(default=None, max_length=128)


class DelegatedTask(BaseModel):
    id: str
    project_id: str
    instruction: str
    language: str
    status: str
    plan: list[TaskStep] = Field(default_factory=list)
    result: str | None = None
    created_at: datetime
    updated_at: datetime


class TaskConfirmResponse(BaseModel):
    task: DelegatedTask
    executed: bool
