from pathlib import Path

import pytest

from app.auth import require_user
from app.main import app
from app.rate_limit import reset_rate_limits


@pytest.fixture(autouse=True)
def isolated_stores(tmp_path: Path):
    from app.services import (
        authority,
        delegation,
        google_connector,
        instagram_connector,
        life,
        memory_engine,
        mentor,
        notifications,
        projects,
        providers,
        truelayer_connector,
    )

    memory_engine.use_store_path(tmp_path / "memory.json")
    authority.use_store_path(tmp_path / "authority.json")
    life.use_store_path(tmp_path / "life.json")
    google_connector.use_store_path(tmp_path / "connectors.json")
    instagram_connector.use_store_path(tmp_path / "instagram.json")
    truelayer_connector.use_store_path(tmp_path / "truelayer.json")
    projects.use_store_path(tmp_path / "projects.json")
    delegation.use_store_path(tmp_path / "delegation.json")
    providers.use_store_path(tmp_path / "providers.json")
    mentor.use_store_path(tmp_path / "mentor.json")
    notifications.reset_store()
    reset_rate_limits()
    app.dependency_overrides[require_user] = lambda: "test-user"
    yield
    app.dependency_overrides.pop(require_user, None)
