"""Allowlisted EchoMind tools. No arbitrary code or shell execution."""

from __future__ import annotations

from app.schemas.life import ObligationCreate, PromiseCreate
from app.schemas.memory import MemoryFactCreate, MemorySource
from app.schemas.notifications import WatchCreate
from app.schemas.connectors import CalendarEventCreate, GmailSendRequest, GmailTrashRequest
from app.services.life import add_obligation, add_promise
from app.services.memory_engine import remember
from app.services.notifications import add_watch
from app.services.google_connector import create_calendar_event, send_gmail, trash_gmail_messages

ALLOWED_TOOLS = {
    "memory.remember",
    "watch.create",
    "gmail.send",
    "gmail.trash",
    "calendar.event.create",
    "life.create_obligation",
    "life.create_promise",
}


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

    if tool == "gmail.trash":
        result = trash_gmail_messages(user_id, GmailTrashRequest.model_validate(parameters))
        return {
            "trashed": int(result.get("trashed", 0)),
            "message_ids": list(result.get("message_ids", [])),
        }

    if tool == "calendar.event.create":
        result = create_calendar_event(user_id, CalendarEventCreate.model_validate(parameters))
        return {"event_id": str(result.get("id", "")), "html_link": str(result.get("htmlLink", ""))}

    if tool == "life.create_obligation":
        item = add_obligation(user_id, ObligationCreate.model_validate(parameters))
        return {
            "obligation_id": item.id,
            "title": item.title,
            "status": item.status.value,
            "due_date": item.due_date.isoformat() if item.due_date else None,
        }

    if tool == "life.create_promise":
        item = add_promise(user_id, PromiseCreate.model_validate(parameters))
        return {
            "promise_id": item.id,
            "counterparty": item.counterparty,
            "status": item.status.value,
        }

    raise ValueError("Tool is not allowlisted")
