"""Renewal Guard: the decision before the renewal.

Subscriptions and policies renew quietly and charge loudly. The guard
finds renewal obligations in the Life Graph, computes the decision
deadline — seven days before the renewal, so the owner still has time to
cancel or switch — and pulls the annual cost out of the obligation text
(£ amounts, yearly or monthly x 12). It never cancels anything itself:
it proposes a calendar blocker for the decision day and names the three
choices (keep / cancel / switch) so the owner decides with the numbers
in front of them.
"""

from __future__ import annotations

import re
from datetime import date, timedelta

from app.schemas.life import Obligation
from app.schemas.renewals import RenewalGuardResponse, RenewalItem
from app.services.life import list_obligations

_DECISION_LEAD_DAYS = 7
_MONEY_RE = re.compile(r"£\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)")


def _is_renewal(item: Obligation) -> bool:
    text = f"{item.title} {item.notes or ''}".lower()
    return "renew" in text


def _annual_cost(item: Obligation) -> float | None:
    text = f"{item.title} {item.notes or ''}"
    match = _MONEY_RE.search(text)
    if not match:
        return None
    amount = float(match.group(1).replace(",", ""))
    if "month" in text.lower():
        return round(amount * 12, 2)
    return amount


def renewal_guard(user_id: str, today: date | None = None) -> RenewalGuardResponse:
    as_of = today or date.today()
    items: list[RenewalItem] = []
    total = 0.0
    for item in list_obligations(user_id, include_closed=False):
        if not _is_renewal(item):
            continue
        renewal_date = item.due_date
        decision = renewal_date - timedelta(days=_DECISION_LEAD_DAYS) if renewal_date else None
        cost = _annual_cost(item)
        if cost is not None:
            total += cost
        blocker: dict[str, object] = {}
        if decision is not None:
            blocker = {
                "tool": "calendar.event.create",
                "summary": f"Decide: {item.title}",
                "parameters": {
                    "summary": f"Decide: {item.title}",
                    "start": decision.isoformat(),
                    "end": decision.isoformat(),
                    "description": "Renewal decision day. Keep, cancel or switch before it renews.",
                    "timezone": "Europe/London",
                },
                "idempotency_key": f"renewal-decision:{item.id}",
            }
        items.append(
            RenewalItem(
                obligation_id=item.id,
                title=item.title,
                renewal_date=renewal_date,
                decision_deadline=decision,
                annual_cost_gbp=cost,
                status=item.status.value,
                actions={
                    "keep": "Let it renew, but note the price.",
                    "cancel": "Find the cancellation link in the renewal email or the provider's account page.",
                    "switch": "Compare the same cover elsewhere before the decision deadline.",
                },
                calendar_blocker=blocker,
            )
        )
    items.sort(key=lambda row: (row.decision_deadline is None, row.decision_deadline or date.max))
    return RenewalGuardResponse(renewals=items, total_annual_cost_gbp=round(total, 2))
