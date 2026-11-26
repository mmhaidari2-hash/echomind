"""Task delegation: "go do this in my such-and-such project".

A task is proposed, the owner confirms it, it runs, and it reports back
with evidence. The three rules that make "can do what I can do" safe:

1. Nothing runs before confirmation. A task is born `proposed`; the
   executor only runs after `confirm_task`.
2. Nothing runs beyond the project's allowlist. Every planned step names
   a tool; a tool not in the project's `allowed_tools` is refused and
   the task ends `needs_owner` with the reason written down.
3. Nothing is claimed without evidence. Every step records what it did
   (or why it could not), and the task result quotes the evidence. A
   step that cannot be verified is reported as not done, never as done.

The planner is deterministic: it recognises the verbs it knows
(check the latest commit, list open issues, remind me / add an
obligation) and turns everything else into an explicit `needs_owner`
step that says what is missing. It never invents a capability.

GitHub steps call the public GitHub API with urllib (no new
dependency, no token). Public repos work with no key. A private repo
returns 404/403 and the step fails closed as "needs access" — the task
does not pretend it saw the repo.
"""

from __future__ import annotations

import json
import os
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.schemas.life import ObligationCreate
from app.schemas.projects import DelegatedTask, TaskCreate, TaskStep
from app.services import projects as projects_service
from app.services.life import add_obligation

_STORE = Path(__file__).resolve().parent.parent / "data" / "delegation.json"
_lock = threading.Lock()
_state: dict[str, dict[str, dict[str, object]]] = {}
_path = _STORE

_GITHUB_API = "https://api.github.com"


def use_store_path(path: Path) -> None:
    global _path
    _path = path
    _load()


def _load() -> None:
    global _state
    try:
        raw = _path.read_text(encoding="utf-8") if _path.exists() else "{}"
        parsed = json.loads(raw) if raw.strip() else {}
        _state = parsed if isinstance(parsed, dict) else {}
    except (OSError, ValueError):
        _state = {}


def _dump() -> None:
    _path.parent.mkdir(parents=True, exist_ok=True)
    tmp = _path.with_suffix(".tmp")
    tmp.write_text(json.dumps(_state, ensure_ascii=False, default=str), encoding="utf-8")
    tmp.replace(_path)


def reset_store() -> None:
    global _state
    _state = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _user(user_id: str) -> dict[str, dict[str, object]]:
    return _state.setdefault(user_id, {})


def _get(user_id: str, task_id: str) -> dict[str, object] | None:
    raw = _user(user_id).get(task_id)
    return dict(raw) if isinstance(raw, dict) else None


def _save(user_id: str, task: DelegatedTask) -> None:
    with _lock:
        _user(user_id)[task.id] = task.model_dump(mode="json")
        _dump()


def _plan(instruction: str) -> list[TaskStep]:
    text = instruction.lower()
    steps: list[TaskStep] = []
    if any(word in text for word in ("آخرین کامیت", "latest commit", "last commit", "آخرین تغییر")):
        steps.append(TaskStep(tool="github.latest_commit", summary="Check the latest commit on the project's repo"))
    if any(word in text for word in ("issue", "ایشو", "مشکلات باز", "open issues")):
        steps.append(TaskStep(tool="github.open_issues", summary="List the project's open issues"))
    if any(word in text for word in ("یادآوری", "یادم بنداز", "مهلت", "remind", "deadline", "obligation")):
        steps.append(TaskStep(tool="life.create_obligation", summary="Record the obligation in the Life Graph, tagged to this project"))
    if not steps:
        steps.append(
            TaskStep(
                tool="owner",
                summary="This needs the owner: no executor tool matches the instruction yet.",
            )
        )
    return steps


def create_task(user_id: str, project_id: str, payload: TaskCreate) -> DelegatedTask:
    project = projects_service.get_project(user_id, project_id)
    if project is None:
        raise LookupError(f"No project with id {project_id}")
    key = payload.idempotency_key or f"task:{project_id}:{uuid.uuid4().hex[:8]}"
    for raw in _user(user_id).values():
        if isinstance(raw, dict) and raw.get("idempotency_key") == key and raw.get("project_id") == project_id:
            return DelegatedTask.model_validate(dict(raw))
    task = DelegatedTask(
        id=uuid.uuid4().hex[:12],
        project_id=project_id,
        instruction=payload.instruction,
        language=payload.language,
        status="proposed",
        plan=_plan(payload.instruction),
        created_at=_now(),
        updated_at=_now(),
    )
    stored = task.model_dump(mode="json")
    stored["idempotency_key"] = key
    with _lock:
        _user(user_id)[task.id] = stored
        _dump()
    return task


def list_tasks(user_id: str, project_id: str) -> list[DelegatedTask]:
    with _lock:
        rows = [row for row in _user(user_id).values() if isinstance(row, dict) and row.get("project_id") == project_id]
        return [DelegatedTask.model_validate(dict(row)) for row in rows]


def get_task(user_id: str, task_id: str) -> DelegatedTask | None:
    raw = _get(user_id, task_id)
    return DelegatedTask.model_validate(raw) if raw is not None else None


def latest_proposed_task(user_id: str) -> DelegatedTask | None:
    with _lock:
        rows = [row for row in _user(user_id).values() if isinstance(row, dict) and row.get("status") == "proposed"]
        if not rows:
            return None
        rows.sort(key=lambda row: str(row.get("created_at", "")))
        return DelegatedTask.model_validate(dict(rows[-1]))


def _github_json(path: str, *, _urlopen=None) -> dict[str, object] | list[object]:
    opener = _urlopen or urlopen
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "EchoMind"}
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if token:
        # A token lifts the unauthenticated rate limit (60/hour on a shared
        # egress IP) and opens private repos. Without one, public repos work
        # until the limit is hit and private repos fail closed as needs_owner.
        headers["Authorization"] = f"Bearer {token}"
    request = Request(
        f"{_GITHUB_API}{path}",
        headers=headers,
        method="GET",
    )
    try:
        with opener(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        if exc.code in {401, 403, 404}:
            raise PermissionError(f"GitHub returned HTTP {exc.code} — the repo is private or unreachable without access") from exc
        raise RuntimeError(f"GitHub request failed (HTTP {exc.code})") from exc
    except URLError as exc:
        raise RuntimeError("GitHub is unreachable") from exc


def _run_step(user_id: str, project, step: TaskStep, instruction: str = "", *, _urlopen=None) -> TaskStep:
    if step.tool == "owner":
        # The "owner" step is a planner marker ("no tool matches"), not a
        # tool — it never goes through the allowlist.
        step.status = "needs_owner"
        step.evidence = "No executor tool matches this instruction yet. The owner needs to do it or approve a new tool."
        return step
    if step.tool not in (project.allowed_tools or []):
        step.status = "refused"
        step.evidence = f"Tool {step.tool} is not allowed in project {project.name}."
        return step
    if step.tool == "github.latest_commit":
        if not project.repo:
            step.status = "needs_owner"
            step.evidence = f"Project {project.name} has no repo linked."
            return step
        payload = _github_json(f"/repos/{project.repo}/commits?per_page=1", _urlopen=_urlopen)
        commits = payload if isinstance(payload, list) else []
        if not commits or not isinstance(commits[0], dict):
            step.status = "failed"
            step.evidence = "GitHub returned no commits."
            return step
        first = commits[0]
        sha = str(first.get("sha", ""))[:7]
        message = str(first.get("commit", {}).get("message", ""))[:120] if isinstance(first.get("commit"), dict) else ""
        step.status = "done"
        step.evidence = f"Latest commit {sha}: {message}"
        return step
    if step.tool == "github.open_issues":
        if not project.repo:
            step.status = "needs_owner"
            step.evidence = f"Project {project.name} has no repo linked."
            return step
        payload = _github_json(f"/repos/{project.repo}/issues?state=open&per_page=5", _urlopen=_urlopen)
        issues = payload if isinstance(payload, list) else []
        titles = [str(item.get("title", ""))[:80] for item in issues if isinstance(item, dict)][:5]
        step.status = "done"
        step.evidence = f"{len(issues)} open issue(s) (first 5): " + ("; ".join(titles) if titles else "none")
        return step
    if step.tool == "life.create_obligation":
        title = f"[{project.name}] {instruction.strip()}"[:200] or f"[{project.name}] Delegated task"
        item = add_obligation(
            user_id,
            ObligationCreate(
                title=title,
                due_date=None,
                source="delegation",
                related_node_ids=[],
                notes=f"Delegated task in project {project.name}.",
            ),
        )
        step.status = "done"
        step.evidence = f"Obligation recorded: {item.id}"
        return step
    step.status = "failed"
    step.evidence = f"Unknown tool {step.tool}."
    return step


def confirm_task(user_id: str, task_id: str, *, _urlopen=None) -> DelegatedTask:
    raw = _get(user_id, task_id)
    if raw is None:
        raise LookupError(f"No task with id {task_id}")
    task = DelegatedTask.model_validate(raw)
    if task.status == "done":
        return task  # idempotent: confirming a finished task changes nothing
    if task.status not in {"proposed", "failed", "needs_owner"}:
        raise ValueError(f"Task is {task.status} and cannot be confirmed")
    project = projects_service.get_project(user_id, task.project_id)
    if project is None:
        task.status = "failed"
        task.result = "The project no longer exists."
        task.updated_at = _now()
        _save(user_id, task)
        return task
    task.status = "running"
    task.updated_at = _now()
    _save(user_id, task)
    failed = False
    needs_owner = False
    for index, step in enumerate(task.plan):
        try:
            task.plan[index] = _run_step(user_id, project, step, task.instruction, _urlopen=_urlopen)
        except PermissionError as exc:
            step.status = "needs_owner"
            step.evidence = str(exc)
            task.plan[index] = step
        except RuntimeError as exc:
            step.status = "failed"
            step.evidence = str(exc)
            task.plan[index] = step
        if task.plan[index].status == "failed":
            failed = True
        if task.plan[index].status in {"needs_owner", "refused"}:
            needs_owner = True
    if failed:
        task.status = "failed"
    elif needs_owner:
        task.status = "needs_owner"
    else:
        task.status = "done"
    done_steps = [step for step in task.plan if step.status == "done"]
    task.result = "; ".join(step.evidence or step.summary for step in done_steps) or "Nothing could be done yet."
    task.updated_at = _now()
    _save(user_id, task)
    return task


_load()
