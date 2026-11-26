"""Schemas for the project registry and task delegation.

A project is one of Mahdi's ~32-38 projects, each with its own identity
and context. A task is "do X in project Y": it is proposed, the owner
confirms it, it runs, and it reports back with evidence. Nothing runs
before confirmation, nothing runs beyond the project's allowed tools.
"""

from datetime import datetime

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    kind: str = Field(default="app", max_length=40)
    identity: str | None = Field(default=None, max_length=80)
    repo: str | None = Field(default=None, max_length=160)
    branch: str | None = Field(default=None, max_length=80)
    allowed_tools: list[str] = Field(default_factory=lambda: ["life.create_obligation", "github.latest_commit", "github.open_issues"])
    notes: str | None = Field(default=None, max_length=1000)


class Project(ProjectCreate):
    id: str
    created_at: datetime
    updated_at: datetime


class TaskStep(BaseModel):
    tool: str
    summary: str
    status: str = "pending"
    evidence: str | None = None


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
