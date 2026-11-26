"""Project registry + delegation tests: lifecycle, allowlist, evidence."""

import json
from contextlib import contextmanager

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


def _fake_opener(payload):
    def opener(request, timeout=None):
        return _FakeResponse(payload)

    return opener


def _project(user_id: str, name: str = "EchoMind", repo: str | None = "mmhaidari2-hash/echomind"):
    return create_project(user_id, ProjectCreate(name=name, kind="app", repo=repo))


def test_project_crud_and_owner_scoping() -> None:
    _as("user-a")
    response = client.post("/api/v1/projects", json={"name": "EchoMind", "kind": "app", "repo": "mmhaidari2-hash/echomind"})
    assert response.status_code == 200
    project_id = response.json()["id"]
    assert client.get("/api/v1/projects").json()[0]["name"] == "EchoMind"
    assert client.get(f"/api/v1/projects/{project_id}").json()["repo"] == "mmhaidari2-hash/echomind"
    _as("user-b")
    assert client.get("/api/v1/projects").json() == []
    assert client.get(f"/api/v1/projects/{project_id}").status_code == 404


def test_task_is_proposed_until_confirmed() -> None:
    _as("user-a")
    project = _project("user-a")
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="آخرین کامیت رو چک کن", language="fa")
    )
    assert task.status == "proposed"
    assert task.plan[0].tool == "github.latest_commit"
    assert task.plan[0].status == "pending"


def test_confirm_runs_the_plan_with_evidence() -> None:
    _as("user-a")
    project = _project("user-a")
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="check the latest commit", language="en")
    )
    fake = _fake_opener([{"sha": "abc1234def", "commit": {"message": "doodombeh: test commit"}}])
    done = delegation_service.confirm_task("user-a", task.id, _urlopen=fake)
    assert done.status == "done"
    assert done.plan[0].status == "done"
    assert "abc1234" in (done.plan[0].evidence or "")
    assert "abc1234" in (done.result or "")


def test_confirm_is_idempotent() -> None:
    _as("user-a")
    project = _project("user-a")
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="check the latest commit", language="en")
    )
    fake = _fake_opener([{"sha": "abc1234", "commit": {"message": "x"}}])
    first = delegation_service.confirm_task("user-a", task.id, _urlopen=fake)
    second = delegation_service.confirm_task("user-a", task.id, _urlopen=fake)
    assert first.status == "done"
    assert second.status == "done"
    assert first.updated_at == second.updated_at


def test_unknown_instruction_needs_the_owner() -> None:
    _as("user-a")
    project = _project("user-a")
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="rewrite the whole app in Rust", language="en")
    )
    assert task.plan[0].tool == "owner"
    done = delegation_service.confirm_task("user-a", task.id)
    assert done.status == "needs_owner"
    assert "owner" in (done.result or "").lower() or "No executor" in (done.plan[0].evidence or "")


def test_tool_outside_the_allowlist_is_refused() -> None:
    _as("user-a")
    project = create_project(
        "user-a",
        ProjectCreate(name="Locked", kind="app", repo="mmhaidari2-hash/echomind", allowed_tools=["life.create_obligation"]),
    )
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="check the latest commit", language="en")
    )
    done = delegation_service.confirm_task("user-a", task.id)
    assert done.status == "needs_owner"
    assert done.plan[0].status == "refused"


def test_private_repo_fails_closed_as_needs_access() -> None:
    from urllib.error import HTTPError

    _as("user-a")
    project = _project("user-a", name="Launcher", repo="mmhaidari2-hash/orbit-shell-launcher")

    def opener(request, timeout=None):
        raise HTTPError(request.full_url, 404, "Not Found", {}, None)

    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="check the latest commit", language="en")
    )
    done = delegation_service.confirm_task("user-a", task.id, _urlopen=opener)
    assert done.status == "needs_owner"
    assert "404" in (done.plan[0].evidence or "")


def test_github_token_is_sent_when_configured(monkeypatch) -> None:
    import os

    monkeypatch.setenv("GITHUB_TOKEN", "ghp_test123")
    seen: dict[str, str] = {}

    def opener(request, timeout=None):
        seen.update(dict(request.headers))
        return _FakeResponse([{"sha": "abc1234", "commit": {"message": "x"}}])

    _as("user-a")
    project = _project("user-a")
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="check the latest commit", language="en")
    )
    done = delegation_service.confirm_task("user-a", task.id, _urlopen=opener)
    assert done.status == "done"
    assert seen.get("Authorization") == "Bearer ghp_test123"


def test_open_issues_step_reports_titles() -> None:
    _as("user-a")
    project = _project("user-a")
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="list open issues", language="en")
    )
    fake = _fake_opener([{"title": "Fix the login"}, {"title": "Add dark mode"}])
    done = delegation_service.confirm_task("user-a", task.id, _urlopen=fake)
    assert done.status == "done"
    assert "Fix the login" in (done.result or "")


def test_task_endpoints_are_owner_scoped() -> None:
    _as("user-a")
    project = _project("user-a")
    task = client.post(
        f"/api/v1/projects/{project.id}/tasks",
        json={"instruction": "check the latest commit", "language": "en"},
    )
    assert task.status_code == 200
    task_id = task.json()["id"]
    _as("user-b")
    assert client.get(f"/api/v1/projects/tasks/{task_id}").status_code == 404
    assert client.post(f"/api/v1/projects/tasks/{task_id}/confirm").status_code == 404
