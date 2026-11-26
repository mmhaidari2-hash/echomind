"""Project registry and task delegation endpoints.

Projects are the owner's, owner-scoped. Tasks are proposed, then the
owner confirms them, then they run — never before confirmation, never
beyond the project's allowlist. Confirming a finished task is a no-op
(idempotent).
"""

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_user
from app.schemas.projects import DelegatedTask, Project, ProjectCreate, TaskConfirmResponse, TaskCreate
from app.services import delegation as delegation_service
from app.services import projects as projects_service

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=Project)
def create_project(payload: ProjectCreate, user_id: str = Depends(require_user)) -> Project:
    return projects_service.create_project(user_id, payload)


@router.get("", response_model=list[Project])
def list_projects(user_id: str = Depends(require_user)) -> list[Project]:
    return projects_service.list_projects(user_id)


@router.get("/{project_id}", response_model=Project)
def get_project(project_id: str, user_id: str = Depends(require_user)) -> Project:
    project = projects_service.get_project(user_id, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/{project_id}/tasks", response_model=DelegatedTask)
def create_task(project_id: str, payload: TaskCreate, user_id: str = Depends(require_user)) -> DelegatedTask:
    try:
        return delegation_service.create_task(user_id, project_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{project_id}/tasks", response_model=list[DelegatedTask])
def list_tasks(project_id: str, user_id: str = Depends(require_user)) -> list[DelegatedTask]:
    if projects_service.get_project(user_id, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return delegation_service.list_tasks(user_id, project_id)


@router.get("/tasks/{task_id}", response_model=DelegatedTask)
def get_task(task_id: str, user_id: str = Depends(require_user)) -> DelegatedTask:
    task = delegation_service.get_task(user_id, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/tasks/{task_id}/confirm", response_model=TaskConfirmResponse)
def confirm_task(task_id: str, user_id: str = Depends(require_user)) -> TaskConfirmResponse:
    try:
        task = delegation_service.confirm_task(user_id, task_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return TaskConfirmResponse(task=task, executed=task.status == "done")
