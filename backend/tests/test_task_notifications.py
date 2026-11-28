"""Notification contract, backend half: a finished or failed delegated
task must show its result AND its reason in the task list.

Before this change, ``confirm_task`` set ``task.result`` to the evidence
of the done steps only — so a failed / needs-owner task showed
"Nothing could be done yet." while the real reason sat buried in one
step's evidence. Now the blocking step's evidence (the reason) is the
result, so DelegatedWork and the finish/fail notification can both show
result + reason. The done path is unchanged (guarded by the existing
verb tests, e.g. "Issue #42 created" in the result).
"""

from app.schemas.projects import ProjectCreate, TaskCreate
from app.services import delegation as delegation_service
from app.services.projects import create_project


def _mentor(user_id: str, **kwargs):
    return create_project(
        user_id,
        ProjectCreate(name="MENTOR", kind="mentor-hub", **kwargs),
    )


def test_needs_owner_task_result_carries_the_reason() -> None:
    # No endpoint anywhere: the first missing piece is the hub itself.
    project = _mentor("user-a", repo="mmhaidari2-hash/atnex-app")
    task = delegation_service.create_task(
        "user-a",
        project.id,
        TaskCreate(instruction="do this in the launcher project", language="en"),
    )
    done = delegation_service.confirm_task("user-a", task.id)
    assert done.status == "needs_owner"
    assert done.result != "Nothing could be done yet."
    assert "No command hub is connected" in (done.result or "")
    assert "No command hub is connected" in (done.plan[0].evidence or "")


def test_needs_owner_task_result_names_the_sign_in() -> None:
    project = _mentor(
        "user-a",
        endpoint_url="https://mentor.example.test/api",
        repo="mmhaidari2-hash/atnex-app",
    )
    task = delegation_service.create_task(
        "user-a",
        project.id,
        TaskCreate(instruction="do this in the launcher project", language="en"),
    )
    done = delegation_service.confirm_task("user-a", task.id)
    assert done.status == "needs_owner"
    assert "sign-in" in (done.result or "")
    assert "Nothing was sent" in (done.result or "")
