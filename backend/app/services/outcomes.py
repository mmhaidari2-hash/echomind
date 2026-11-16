"""Outcome Loop: identify what needs follow-up without inventing outcomes."""

from __future__ import annotations

from datetime import date

from app.schemas.life import ObligationStatus, PromiseStatus
from app.schemas.outcomes import OutcomeItem, OutcomeKind, OutcomePriority
from app.services.life import list_obligations, list_promises


def pending_outcomes(user_id: str) -> list[OutcomeItem]:
    today = date.today()
    items: list[OutcomeItem] = []

    for obligation in list_obligations(user_id):
        if obligation.status is ObligationStatus.overdue:
            items.append(
                OutcomeItem(
                    id=f"obligation:{obligation.id}",
                    kind=OutcomeKind.obligation,
                    priority=OutcomePriority.urgent,
                    title=obligation.title,
                    reason="This obligation is overdue and needs follow-up.",
                    due_date=obligation.due_date,
                    source_id=obligation.id,
                )
            )
        elif obligation.status is ObligationStatus.due_soon:
            items.append(
                OutcomeItem(
                    id=f"obligation:{obligation.id}",
                    kind=OutcomeKind.obligation,
                    priority=OutcomePriority.soon,
                    title=obligation.title,
                    reason="This obligation is due within seven days.",
                    due_date=obligation.due_date,
                    source_id=obligation.id,
                )
            )

    for promise in list_promises(user_id):
        if promise.status is not PromiseStatus.open or not promise.due_date:
            continue
        days = (promise.due_date - today).days
        if days < 0:
            items.append(
                OutcomeItem(
                    id=f"promise:{promise.id}",
                    kind=OutcomeKind.promise_verification,
                    priority=OutcomePriority.urgent,
                    title=f"Verify promise from {promise.counterparty}",
                    reason="The promised date has passed. Verify what actually happened before marking it kept or broken.",
                    due_date=promise.due_date,
                    source_id=promise.id,
                    requires_verification=True,
                )
            )
        elif days <= 7:
            items.append(
                OutcomeItem(
                    id=f"promise:{promise.id}",
                    kind=OutcomeKind.promise_verification,
                    priority=OutcomePriority.watch,
                    title=f"Promise due from {promise.counterparty}",
                    reason="This promise is due soon. Keep the evidence and verify the outcome.",
                    due_date=promise.due_date,
                    source_id=promise.id,
                    requires_verification=True,
                )
            )

    rank = {OutcomePriority.urgent: 0, OutcomePriority.soon: 1, OutcomePriority.watch: 2}
    return sorted(items, key=lambda item: (rank[item.priority], item.due_date or date.max, item.id))
