"""Allowlisted EchoMind tools. No arbitrary code or shell execution."""

from __future__ import annotations

from app.schemas.memory import MemoryFactCreate, MemorySource
from app.schemas.notifications import WatchCreate
from app.services.memory_engine import remember
from app.services.notifications import add_watch

ALLOWED_TOOLS = {"memory.remember", "watch.create"}


def execute_tool(user_id: str, tool: str, parameters: dict[str, object]) -> dict[str, object]:
    if tool == "memory.remember":
        fact = remember(
            user_id,
            MemoryFactCreate(
                key=str(parameters.get("key", "")).strip(),
                value=str(parameters.get("value", "")).strip(),
                source=MemorySource.preference,
            ),
        )
        return {"fact_id": fact.id, "key": fact.key}

    if tool == "watch.create":
        record = add_watch(user_id, WatchCreate.model_validate(parameters))
        return {"watch_id": record.id, "kind": record.kind.value, "title": record.title}

    raise ValueError("Tool is not allowlisted")
