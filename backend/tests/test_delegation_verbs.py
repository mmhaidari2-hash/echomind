"""Delegation verbs beyond the first three: create issue, read file,
open PR, CI status — the Claude project-work gap."""

import base64
import json
from urllib.error import HTTPError

from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app
from app.schemas.projects import ProjectCreate, TaskCreate
from app.services import delegation as delegation_service
from app.services.projects import create_project

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


class _FakeResponse:
    def __init__(self, payload):
        self._payload = json.dumps(payload).encode("utf-8")

    def read(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class _GitHubFake:
    """Dispatches on method + URL, records every call."""

    def __init__(self):
        self.calls: list[tuple[str, str, bytes | None]] = []

    def __call__(self, request, timeout=None):
        method = request.get_method()
        url = request.full_url
        data = request.data
        self.calls.append((method, url, data))
        if method == "POST" and url.endswith("/issues"):
            body = json.loads(data or b"{}")
            return _FakeResponse({"number": 42, "html_url": "https://github.com/x/y/issues/42", "title": body.get("title")})
        if method == "POST" and url.endswith("/pulls"):
            body = json.loads(data or b"{}")
            return _FakeResponse({"number": 7, "html_url": "https://github.com/x/y/pull/7", "title": body.get("title")})
        if "/contents/" in url:
            if url.endswith("/contents/src"):
                return _FakeResponse([{"name": "a.py", "type": "dir"}])
            content = base64.b64encode(b"hello world\nsecond line\n").decode()
            return _FakeResponse({"encoding": "base64", "content": content, "sha": "abc1234def", "size": 24})
        if "/actions/runs" in url:
            return _FakeResponse(
                {
                    "workflow_runs": [
                        {"name": "Backend Tests", "head_branch": "main", "status": "completed", "conclusion": "success"},
                        {"name": "Android APK", "head_branch": "main", "status": "completed", "conclusion": "failure"},
                    ]
                }
            )
        if "/commits" in url:
            return _FakeResponse([{"sha": "abc1234def", "commit": {"message": "doodombeh: test commit"}}])
        if "/issues" in url:
            return _FakeResponse([{"title": "Fix the login"}])
        raise AssertionError(f"unexpected GitHub call {method} {url}")


def _project(user_id: str, name: str = "EchoMind", repo: str | None = "mmhaidari2-hash/echomind"):
    return create_project(user_id, ProjectCreate(name=name, kind="app", repo=repo))


def _confirm(user_id: str, instruction: str, opener, language: str = "en"):
    project = _project(user_id)
    task = delegation_service.create_task(user_id, project.id, TaskCreate(instruction=instruction, language=language))
    return task, delegation_service.confirm_task(user_id, task.id, _urlopen=opener)


def test_planner_extracts_issue_title_english_and_persian() -> None:
    _as("user-a")
    project = _project("user-a")
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="create an issue: login fails on Android", language="en")
    )
    assert task.plan[0].tool == "github.create_issue"
    assert task.plan[0].params["title"] == "login fails on Android"
    task_fa = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="ایشو بساز ورود با گوگل خرابه", language="fa")
    )
    assert task_fa.plan[0].tool == "github.create_issue"
    assert task_fa.plan[0].params["title"] == "ورود با گوگل خرابه"


def test_planner_extracts_file_path_and_pr_branches() -> None:
    _as("user-a")
    project = _project("user-a")
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="read the file src/App.jsx", language="en")
    )
    assert task.plan[0].tool == "github.read_file"
    assert task.plan[0].params["path"] == "src/App.jsx"
    task_fa = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="فایل README.md رو بخون", language="fa")
    )
    assert task_fa.plan[0].tool == "github.read_file"
    assert task_fa.plan[0].params["path"] == "README.md"
    task_pr = delegation_service.create_task(
        "user-a",
        project.id,
        TaskCreate(instruction="open a pull request from feature-x into main", language="en"),
    )
    assert task_pr.plan[0].tool == "github.open_pr"
    assert task_pr.plan[0].params["head"] == "feature-x"
    assert task_pr.plan[0].params["base"] == "main"
    assert task_pr.plan[0].params["title"] == "Merge feature-x into main"


def test_create_issue_posts_to_github() -> None:
    _as("user-a")
    opener = _GitHubFake()
    _task, done = _confirm("user-a", "create an issue: login fails on Android", opener)
    assert done.status == "done"
    assert "Issue #42 created" in (done.result or "")
    assert "issues/42" in (done.plan[0].evidence or "")
    method, url, data = opener.calls[0]
    assert method == "POST" and url.endswith("/repos/mmhaidari2-hash/echomind/issues")
    assert json.loads(data or b"{}")["title"] == "login fails on Android"


def test_create_issue_without_title_needs_the_owner() -> None:
    _as("user-a")
    opener = _GitHubFake()
    _task, done = _confirm("user-a", "create an issue", opener)
    assert done.status == "needs_owner"
    assert "title" in (done.plan[0].evidence or "").lower()
    assert opener.calls == []


def test_read_file_returns_content_with_evidence() -> None:
    _as("user-a")
    opener = _GitHubFake()
    _task, done = _confirm("user-a", "read the file README.md", opener)
    assert done.status == "done"
    assert "hello world" in (done.plan[0].evidence or "")
    assert "README.md" in (done.plan[0].evidence or "")


def test_read_file_directory_needs_the_owner() -> None:
    _as("user-a")
    opener = _GitHubFake()
    _task, done = _confirm("user-a", 'read the file "src"', opener)
    assert done.status == "needs_owner"
    assert "folder" in (done.plan[0].evidence or "").lower()


def test_open_pr_posts_head_and_base() -> None:
    _as("user-a")
    opener = _GitHubFake()
    _task, done = _confirm("user-a", "open a pull request from feature-x into main", opener)
    assert done.status == "done"
    assert "Pull request #7 opened" in (done.result or "")
    method, url, data = opener.calls[0]
    assert method == "POST" and url.endswith("/repos/mmhaidari2-hash/echomind/pulls")
    body = json.loads(data or b"{}")
    assert body["head"] == "feature-x" and body["base"] == "main"


def test_open_pr_without_branches_needs_the_owner() -> None:
    _as("user-a")
    opener = _GitHubFake()
    _task, done = _confirm("user-a", "open a pull request", opener)
    assert done.status == "needs_owner"
    assert "branches" in (done.plan[0].evidence or "").lower()
    assert opener.calls == []


def test_ci_status_reports_latest_runs() -> None:
    _as("user-a")
    opener = _GitHubFake()
    _task, done = _confirm("user-a", "what is the CI status?", opener)
    assert done.status == "done"
    assert "Backend Tests" in (done.result or "")
    assert "success" in (done.result or "")
    assert "failure" in (done.result or "")


def test_write_verbs_fail_closed_without_a_token() -> None:
    _as("user-a")

    def opener(request, timeout=None):
        raise HTTPError(request.full_url, 401, "Unauthorized", {}, None)

    project = _project("user-a")
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="create an issue: something broke", language="en")
    )
    done = delegation_service.confirm_task("user-a", task.id, _urlopen=opener)
    assert done.status == "needs_owner"
    assert "401" in (done.plan[0].evidence or "")


def test_new_verbs_are_refused_when_not_in_the_allowlist() -> None:
    _as("user-a")
    project = create_project(
        "user-a",
        ProjectCreate(name="Locked", kind="app", repo="mmhaidari2-hash/echomind", allowed_tools=["github.latest_commit"]),
    )
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="create an issue: something broke", language="en")
    )
    done = delegation_service.confirm_task("user-a", task.id)
    assert done.status == "needs_owner"
    assert done.plan[0].status == "refused"


def test_combined_plan_still_works() -> None:
    _as("user-a")
    opener = _GitHubFake()
    _task, done = _confirm("user-a", "check the latest commit and list open issues", opener)
    assert done.status == "done"
    assert [step.tool for step in done.plan] == ["github.latest_commit", "github.open_issues"]
