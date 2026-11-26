"""Project registry: Mahdi's projects, each with its own identity.

One owner-scoped JSON store (same pattern as the Life Graph store):
each user has a bucket of projects keyed by id. A project carries its
name, its kind, the agent identity Mahdi gave it (Doodombeh for the
launcher, ...), the GitHub repo when there is one, and the tools the
agent is allowed to use inside that project. The allowlist is the
Bounded Authority boundary: the delegation executor refuses any tool
not listed here, per project.
"""

from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.schemas.projects import Project, ProjectCreate

_STORE = Path(__file__).resolve().parent.parent / "data" / "projects.json"
_lock = threading.Lock()
_state: dict[str, dict[str, dict[str, object]]] = {}
_path = _STORE


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


def create_project(user_id: str, payload: ProjectCreate) -> Project:
    with _lock:
        project = Project(
            id=uuid.uuid4().hex[:12],
            created_at=_now(),
            updated_at=_now(),
            **payload.model_dump(),
        )
        _user(user_id)[project.id] = project.model_dump(mode="json")
        _dump()
        return project


def list_projects(user_id: str) -> list[Project]:
    with _lock:
        rows = _user(user_id).values()
        return [Project.model_validate(dict(row)) for row in rows]


def get_project(user_id: str, project_id: str) -> Project | None:
    with _lock:
        raw = _user(user_id).get(project_id)
        return Project.model_validate(dict(raw)) if isinstance(raw, dict) else None


def find_project_by_name(user_id: str, name: str) -> Project | None:
    needle = (name or "").strip().lower()
    if not needle:
        return None
    # Persian names for Mahdi's projects (اکومایند = EchoMind, ...).
    # Transliteration does not bridge scripts, so known aliases are
    # matched explicitly; owners can add more per project.
    aliases = {
        "اکومایند": "echomind",
        "اکو مایند": "echomind",
        "اپ سازی": "appsazi",
        "اپسازی": "appsazi",
        "اپ‌سازی": "appsazi",
        "لانچر": "orbit-shell-launcher",
        "اربیت": "orbit-shell-launcher",
        "دودومبه": "doodombeh",
    }
    needle = aliases.get(needle, needle)
    for project in list_projects(user_id):
        if project.name.strip().lower() == needle:
            return project
    for project in list_projects(user_id):
        if needle in project.name.strip().lower() or project.name.strip().lower() in needle:
            return project
    return None


_load()
