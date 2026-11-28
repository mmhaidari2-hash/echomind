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
(check the latest commit, list open issues, create an issue, read a
file, open a pull request, check CI status, remind me / add an
obligation) and turns everything else into an explicit `needs_owner`
step that says what is missing. It never invents a capability. Steps
that need parameters (issue title, file path, PR branches) carry them
in `step.params`, extracted from the instruction — the owner sees them
in the plan before confirming.

For a "mentor-hub" project (Mahdi's MENTOR — the command centre
for all his projects, connected via API + GitHub to all his
agents, working on his command) the planner hands any
instruction no other verb matches to MENTOR as one gated
`mentor.delegate` step. MENTOR is the hub: EchoMind proposes, the
owner confirms, and the work is handed to MENTOR through its
own dashboard form (POST /app/agents — repo, instruction,
engine; see services/mentor.py). The step cannot run without a
stored MENTOR session — until then it fails closed as
needs_owner with the exact missing piece, and nothing is
claimed as done by MENTOR until MENTOR itself redirects to the
created task.

GitHub steps call the public GitHub API with urllib (no new
dependency, no token). Public repos work with no key. A private repo
returns 404/403 and the step fails closed as "needs access" — the task
does not pretend it saw the repo. Write steps (create issue, open PR)
need a token with repo scope: without one GitHub returns 401/403 and
the step fails closed as "needs access" instead of pretending it wrote.
"""

from __future__ import annotations

import base64
import json
import os
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.schemas.life import ObligationCreate
from app.schemas.projects import DelegatedTask, TaskCreate, TaskStep
from app.services import mentor as mentor_service
from app.services import projects as projects_service
from app.services.life import add_obligation
from app.services.mentor import (
    MentorNotConfiguredError,
    MentorNotReadyError,
    MentorUpstreamError,
)

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


_ISSUE_WORDS = ("create an issue", "open an issue", "new issue", "file an issue", "ایشو بساز", "ایجاد ایشو", "یک ایشو", "ایشو جدید")
_READ_FILE_WORDS = ("read file", "read the file", "show me the file", "show the file", "فایل رو بخون", "فایل را بخون", "فایل رو نشون بده", "فایل را نشان بده")
_PR_WORDS = ("open a pull request", "create a pull request", "new pull request", "pull request", "پول ریکوئست", "پی آر")
_CI_WORDS = ("ci status", "build status", "check status", "latest build", "وضعیت بیلد", "وضعیت سی آی", "وضعیت سی‌آی", "چک ها", "چک‌ها", "آخرین بیلد")
_BARE_FILENAMES = ("README", "LICENSE", "CHANGELOG", "CONTRIBUTING")

def _after_keyword(instruction: str, keywords: tuple[str, ...]) -> str:
    """Text after the first matching keyword, separators stripped."""
    lowered = instruction.lower()
    for keyword in keywords:
        idx = lowered.find(keyword.lower())
        if idx >= 0:
            rest = instruction[idx + len(keyword):].strip()
            return rest.lstrip(":—-–،, ").strip()
    return ""


def _extract_path(instruction: str) -> str:
    quoted = re.search(r'"([^"]+)"', instruction) or re.search(r"'([^']+)'", instruction)
    if quoted:
        return quoted.group(1).strip()
    match = re.search(r"([A-Za-z0-9_.\-/]+\.[A-Za-z0-9]{1,10})", instruction)
    if match:
        return match.group(1)
    for bare in _BARE_FILENAMES:
        if re.search(rf"\b{bare}\b", instruction, re.IGNORECASE):
            return bare
    return ""


def _extract_pr_branches(instruction: str) -> tuple[str, str]:
    match = re.search(
        r"from\s+([A-Za-z0-9_.\-/]+)\s+(?:to|into)\s+([A-Za-z0-9_.\-/]+)",
        instruction,
        re.IGNORECASE,
    )
    if match:
        return match.group(1), match.group(2)
    match = re.search(r"از\s+(\S+)\s+به\s+(\S+)", instruction)
    if match:
        return match.group(1), match.group(2)
    return "", ""


def _extract_engine(instruction: str) -> str:
    """Which MENTOR engine the instruction asks for, if any.
    Only the engines MENTOR's own form accepts; anything else is
    "auto" — MENTOR decides. Longer names first so "codex_auto"
    is not read as plain "codex"."""
    text = instruction.lower()
    for engine in ("codex_auto", "claude_routine_manual", "claude_routine", "codex", "cursor", "routine"):
        if engine.replace("_", " ") in text or engine in text:
            return engine
    return "auto"


def _plan(instruction: str, project_kind: str | None = None) -> list[TaskStep]:
    text = instruction.lower()
    steps: list[TaskStep] = []
    if any(word in text for word in ("آخرین کامیت", "latest commit", "last commit", "آخرین تغییر")):
        steps.append(TaskStep(tool="github.latest_commit", summary="Check the latest commit on the project's repo"))
    if any(word in text for word in ("issue", "ایشو", "مشکلات باز", "open issues")) and not any(
        word in text for word in _ISSUE_WORDS
    ):
        steps.append(TaskStep(tool="github.open_issues", summary="List the project's open issues"))
    if any(word in text for word in _ISSUE_WORDS):
        title = _after_keyword(instruction, _ISSUE_WORDS).strip("\"' ").strip()
        steps.append(
            TaskStep(
                tool="github.create_issue",
                summary=f"Create a GitHub issue{' — ' + title[:80] if title else ' (no title given yet)'}",
                params={"title": title},
            )
        )
    if any(word in text for word in _READ_FILE_WORDS) or (
        "فایل" in text and any(word in text for word in ("بخون", "نشون", "نشان بده"))
    ):
        path = _extract_path(instruction)
        steps.append(
            TaskStep(
                tool="github.read_file",
                summary=f"Read the file {path}" if path else "Read a file (no path given yet)",
                params={"path": path},
            )
        )
    if any(word in text for word in _PR_WORDS):
        head, base = _extract_pr_branches(instruction)
        title = _after_keyword(instruction, _PR_WORDS)
        title = re.sub(
            r"from\s+[A-Za-z0-9_.\-/]+\s+(?:to|into)\s+[A-Za-z0-9_.\-/]+",
            "",
            title,
            flags=re.IGNORECASE,
        ).strip(" :—-–،,")
        if not title and head and base:
            title = f"Merge {head} into {base}"
        steps.append(
            TaskStep(
                tool="github.open_pr",
                summary=f"Open a pull request{' — ' + title[:80] if title else ' (branches not given yet)'}",
                params={"title": title, "head": head, "base": base},
            )
        )
    if any(word in text for word in _CI_WORDS):
        steps.append(TaskStep(tool="github.ci_status", summary="Check the latest CI / workflow runs"))
    if any(word in text for word in ("یادآوری", "یادم بنداز", "مهلت", "remind", "deadline", "obligation")):
        steps.append(TaskStep(tool="life.create_obligation", summary="Record the obligation in the Life Graph, tagged to this project"))
    if not steps:
        if project_kind == "mentor-hub":
            # MENTOR is the hub for all his projects: anything no
            # other verb matches is handed to MENTOR, gated.
            steps.append(
                TaskStep(
                    tool="mentor.delegate",
                    summary="Hand this to MENTOR — it reaches all your projects",
                    params={"instruction": instruction, "engine": _extract_engine(instruction)},
                )
            )
        else:
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
        plan=_plan(payload.instruction, project.kind),
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


def _github_write(
    path: str, body: dict[str, object], *, _urlopen=None
) -> dict[str, object]:
    """POST a JSON body to the GitHub API. Same auth and fail-closed
    mapping as _github_json, plus 422 (validation — e.g. a PR with no
    differences, or an empty title) as a plain failure, never a guess."""
    opener = _urlopen or urlopen
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "EchoMind"}
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(
        f"{_GITHUB_API}{path}",
        data=json.dumps(body).encode("utf-8"),
        headers={**headers, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with opener(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        if exc.code in {401, 403, 404}:
            raise PermissionError(
                f"GitHub returned HTTP {exc.code} — writing needs a token with repo scope"
            ) from exc
        if exc.code == 422:
            raise RuntimeError(
                "GitHub rejected the request (422) — check the title/branches (e.g. a pull request with no differences)"
            ) from exc
        raise RuntimeError(f"GitHub request failed (HTTP {exc.code})") from exc
    except URLError as exc:
        raise RuntimeError("GitHub is unreachable") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("GitHub returned an invalid response")
    return payload


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
    if step.tool == "github.create_issue":
        if not project.repo:
            step.status = "needs_owner"
            step.evidence = f"Project {project.name} has no repo linked."
            return step
        title = str(step.params.get("title", "") or "").strip()
        if not title:
            step.status = "needs_owner"
            step.evidence = "No issue title was given. Say what the issue is about, e.g. 'create an issue: login fails on Android'."
            return step
        payload = _github_write(
            f"/repos/{project.repo}/issues",
            {
                "title": title[:200],
                "body": f"Requested in EchoMind delegation in project {project.name}.\n\nInstruction: {instruction}",
            },
            _urlopen=_urlopen,
        )
        number = payload.get("number")
        url = payload.get("html_url", "")
        step.status = "done"
        step.evidence = f"Issue #{number} created: {url}" if number else "Issue created on GitHub."
        return step
    if step.tool == "github.read_file":
        if not project.repo:
            step.status = "needs_owner"
            step.evidence = f"Project {project.name} has no repo linked."
            return step
        path = str(step.params.get("path", "") or "").strip()
        if not path:
            step.status = "needs_owner"
            step.evidence = "No file path was given. Say which file, e.g. 'read the file README.md'."
            return step
        payload = _github_json(
            f"/repos/{project.repo}/contents/{quote(path, safe='/')}", _urlopen=_urlopen
        )
        if isinstance(payload, list):
            step.status = "needs_owner"
            step.evidence = f"'{path}' is a folder, not a file. Name one file inside it."
            return step
        if not isinstance(payload, dict) or payload.get("encoding") != "base64":
            step.status = "failed"
            step.evidence = f"GitHub did not return '{path}' as a file."
            return step
        try:
            text = base64.b64decode(str(payload.get("content", ""))).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            step.status = "needs_owner"
            step.evidence = f"'{path}' is not a text file, so it cannot be read here."
            return step
        sha = str(payload.get("sha", ""))[:7]
        total = len(text)
        shown = text[:4000]
        step.status = "done"
        step.evidence = (
            f"File {path} (sha {sha}, {total} chars)"
            + (" — truncated to 4,000 chars" if total > 4000 else "")
            + f":\n{shown}"
        )
        return step
    if step.tool == "github.open_pr":
        if not project.repo:
            step.status = "needs_owner"
            step.evidence = f"Project {project.name} has no repo linked."
            return step
        title = str(step.params.get("title", "") or "").strip()
        head = str(step.params.get("head", "") or "").strip()
        base = str(step.params.get("base", "") or "").strip()
        if not head or not base:
            step.status = "needs_owner"
            step.evidence = (
                "A pull request needs both branches. Say them like "
                "'open a pull request from feature-x into main'."
            )
            return step
        payload = _github_write(
            f"/repos/{project.repo}/pulls",
            {
                "title": (title or f"Merge {head} into {base}")[:200],
                "head": head,
                "base": base,
                "body": f"Requested in EchoMind delegation in project {project.name}.\n\nInstruction: {instruction}",
            },
            _urlopen=_urlopen,
        )
        number = payload.get("number")
        url = payload.get("html_url", "")
        step.status = "done"
        step.evidence = f"Pull request #{number} opened: {url}" if number else "Pull request opened on GitHub."
        return step
    if step.tool == "github.ci_status":
        if not project.repo:
            step.status = "needs_owner"
            step.evidence = f"Project {project.name} has no repo linked."
            return step
        payload = _github_json(f"/repos/{project.repo}/actions/runs?per_page=5", _urlopen=_urlopen)
        runs = payload.get("workflow_runs") if isinstance(payload, dict) else None
        if not isinstance(runs, list) or not runs:
            step.status = "done"
            step.evidence = "No workflow runs yet on this repo."
            return step
        lines = []
        for run in runs[:5]:
            if not isinstance(run, dict):
                continue
            lines.append(
                f"{run.get('name', 'run')} ({run.get('head_branch', '?')}) — "
                f"{run.get('conclusion') or run.get('status', '?')}"
            )
        step.status = "done"
        step.evidence = "Latest CI runs: " + "; ".join(lines)
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
    if step.tool == "mentor.delegate":
        if project.kind != "mentor-hub":
            step.status = "needs_owner"
            step.evidence = f"Project {project.name} is not a MENTOR hub project."
            return step
        repo = (getattr(project, "repo", None) or "").strip()
        if not repo:
            step.status = "needs_owner"
            step.evidence = (
                "No repo is linked to this hub project — say which project "
                "the hub should work on (owner/repo)."
            )
            return step
        engine = str(step.params.get("engine") or "auto")
        try:
            result = mentor_service.submit_task(
                user_id,
                repo,
                str(step.params.get("instruction") or instruction),
                engine,
                endpoint=getattr(project, "endpoint_url", None),
                _urlopen=_urlopen,
            )
        except (MentorNotReadyError, MentorNotConfiguredError) as exc:
            step.status = "needs_owner"
            step.evidence = str(exc)
            return step
        except MentorUpstreamError as exc:
            step.status = "failed"
            step.evidence = str(exc)
            return step
        step.status = "done"
        step.evidence = f"MENTOR task {result.task_id} created: {result.task_url}"
        if result.paused:
            step.evidence += (
                " — the hub's agents are paused, so this stays queued until a worker is enabled."
            )
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
    done_text = "; ".join(step.evidence or step.summary for step in done_steps)
    # The notification contract: a failed task must show its reason, not
    # just "Nothing could be done yet." The blocking step's evidence IS the
    # reason (e.g. "MENTOR's endpoint is missing"). It goes into
    # task.result so the in-app task list and the finish/fail notification
    # can both show result + reason.
    blocking = next(
        (step for step in task.plan if step.status in {"failed", "needs_owner", "refused"}),
        None,
    )
    if blocking is not None and blocking.evidence:
        task.result = f"{blocking.evidence} — {done_text}" if done_text else blocking.evidence
    else:
        task.result = done_text or "Nothing could be done yet."
    task.updated_at = _now()
    _save(user_id, task)
    return task


_load()
