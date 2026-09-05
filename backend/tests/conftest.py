from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def isolated_stores(tmp_path: Path) -> None:
    from app.services import memory_engine, notifications

    memory_engine.use_store_path(tmp_path / "memory.json")
    notifications.reset_store()
