"""MENTOR as an EchoMind plugin: the "mentor-hub" project kind.

MENTOR is Mahdi's command centre for all his projects —
connected via API + GitHub to all his agents, working on his
command. EchoMind registers it as one hub entry in the
delegation registry: anything EchoMind cannot do itself is
handed to MENTOR as one gated step, propose → confirm → run,
under the same Bounded Authority gates. Verified 2026-11-26:
MENTOR is the private repo mmhaidari2-hash/MENTOR, production
app https://mentor-web-production-096b.up.railway.app, and the
delegation route is its owner-only dashboard form
POST /app/agents (repo, instruction, engine). The step fails
closed as needs_owner until a MENTOR session is stored — never
a guessed call.
"""

from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app
from app.schemas.projects import MENTOR_HUB_TOOLS, ProjectCreate, TaskCreate
from app.services import delegation as delegation_service
from app.services import projects as projects_service
from app.services.projects import create_project

client = TestClient(app)


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def _mentor(user_id: str, endpoint_url: str | None = None, allowed_tools=None, repo: str | None = None):
    kwargs = {"name": "MENTOR", "kind": "mentor-hub", "endpoint_url": endpoint_url, "repo": repo}
    if allowed_tools is not None:
        kwargs["allowed_tools"] = allowed_tools
    return create_project(user_id, ProjectCreate(**kwargs))


def test_mentor_hub_project_gets_mentor_tools() -> None:
    project = _mentor("user-a")
    assert project.kind == "mentor-hub"
    assert project.endpoint_url is None
    assert project.allowed_tools == MENTOR_HUB_TOOLS
    assert "mentor.delegate" in project.allowed_tools
    assert "github.create_issue" not in project.allowed_tools
    assert "github.open_pr" not in project.allowed_tools
    assert "github.read_file" not in project.allowed_tools


def test_mentor_hub_project_stores_endpoint_url() -> None:
    project = _mentor("user-a", endpoint_url="https://mentor.example.test/api")
    assert project.endpoint_url == "https://mentor.example.test/api"


def test_planner_routes_unknown_instruction_to_mentor() -> None:
    project = _mentor("user-a")
    task = delegation_service.create_task(
        "user-a",
        project.id,
        TaskCreate(instruction="برو تو پروژه لانچر اینو انجام بده", language="fa"),
    )
    assert [step.tool for step in task.plan] == ["mentor.delegate"]
    assert "لانچر" in str(task.plan[0].params.get("instruction", ""))


def test_planner_keeps_known_verbs_on_mentor_hub() -> None:
    project = _mentor("user-a")
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="check the latest commit", language="en")
    )
    assert [step.tool for step in task.plan] == ["github.latest_commit"]


def test_non_mentor_project_gets_owner_step_for_unknown_instruction() -> None:
    project = create_project("user-a", ProjectCreate(name="EchoMind", kind="app", repo="mmhaidari2-hash/echomind"))
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="برو تو پروژه لانچر اینو انجام بده", language="fa")
    )
    assert [step.tool for step in task.plan] == ["owner"]


def test_confirm_without_hub_needs_owner_with_no_hub() -> None:
    # No endpoint anywhere and no session: the first missing
    # piece is the hub itself — the slot is empty until a hub is
    # plugged in. Nothing is sent. (The repo is linked so the
    # check reaches the hub, not the repo.)
    project = _mentor("user-a", repo="mmhaidari2-hash/atnex-app")
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="do this in the launcher project", language="en")
    )
    done = delegation_service.confirm_task("user-a", task.id)
    assert done.status == "needs_owner"
    assert done.plan[0].status == "needs_owner"
    assert "No command hub is connected" in (done.plan[0].evidence or "")


def test_confirm_without_session_needs_owner_with_sign_in() -> None:
    project = _mentor(
        "user-a", endpoint_url="https://mentor.example.test/api", repo="mmhaidari2-hash/atnex-app"
    )
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="do this in the launcher project", language="en")
    )
    done = delegation_service.confirm_task("user-a", task.id)
    assert done.status == "needs_owner"
    assert done.plan[0].status == "needs_owner"
    assert "sign-in" in (done.plan[0].evidence or "")
    assert "Nothing was sent" in (done.plan[0].evidence or "")


def test_mentor_tool_outside_allowlist_is_refused() -> None:
    project = _mentor(
        "user-a",
        endpoint_url="https://mentor.example.test/api",
        allowed_tools=["github.latest_commit"],
    )
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="do this in the launcher project", language="en")
    )
    done = delegation_service.confirm_task("user-a", task.id)
    assert done.plan[0].status == "refused"
    assert "not allowed" in (done.plan[0].evidence or "")


def test_mentor_persian_alias_resolves() -> None:
    _mentor("user-a")
    found = projects_service.find_project_by_name("user-a", "منتور")
    assert found is not None
    assert found.name == "MENTOR"
