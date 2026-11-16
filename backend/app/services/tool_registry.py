"""Allowlisted EchoMind tools. No arbitrary code or shell execution."""

from __future__ import annotations

from app.schemas.memory import MemoryFactCreate, MemorySource
from app.schemas.notifications import WatchCreate
from app.schemas.connectors import CalendarEventCreate, GmailSendRequest
from app.services.memory_engine import remember
from app.services.notifications import add_watch
from app.services.google_connector import create_calendar_event, send_gmail

ALLOWED_TOOLS = {"memory.remember", "watch.create", "gmail.send", "calendar.event.create"}


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

    if tool == "gmail.send":
        result = send_gmail(user_id, GmailSendRequest.model_validate(parameters))
        return {"message_id": str(result.get("id", "")), "thread_id": str(result.get("threadId", ""))}

    if tool == "calendar.event.create":
        result = create_calendar_event(user_id, CalendarEventCreate.model_validate(parameters))
        return {"event_id": str(result.get("id", "")), "html_link": str(result.get("htmlLink", ""))}

    raise ValueError("Tool is not allowlisted")
