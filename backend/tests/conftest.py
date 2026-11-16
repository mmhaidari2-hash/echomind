from pathlib import Path

import pytest

from app.auth import require_user
from app.main import app
from app.rate_limit import reset_rate_limits


@pytest.fixture(autouse=True)
def isolated_stores(tmp_path: Path):
    from app.services import authority, google_connector, life, memory_engine, notifications

    memory_engine.use_store_path(tmp_path / "memory.json")
    authority.use_store_path(tmp_path / "authority.json")
    life.use_store_path(tmp_path / "life.json")
    google_connector.use_store_path(tmp_path / "connectors.json")
    notifications.reset_store()
    reset_rate_limits()
    app.dependency_overrides[require_user] = lambda: "test-user"
    yield
    app.dependency_overrides.pop(require_user, None)
