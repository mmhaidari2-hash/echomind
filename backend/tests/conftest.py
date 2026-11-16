from pathlib import Path

import pytest

from app.auth import require_user
from app.main import app


@pytest.fixture(autouse=True)
def isolated_stores(tmp_path: Path):
    from app.services import memory_engine, notifications

    memory_engine.use_store_path(tmp_path / "memory.json")
    notifications.reset_store()
    app.dependency_overrides[require_user] = lambda: "test-user"
    yield
    app.dependency_overrides.pop(require_user, None)
