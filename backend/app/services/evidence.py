"""Evidence Locker: how complete is the proof, and all of it in one pack.

For every obligation and promise the locker scores completeness:
- 40 points for having evidence attached at all;
- 30 points for a due date;
- 30 points for the other party (counterparty) or a named title.
It then tries to fetch the evidence message details from Gmail (best
effort: when Google is not connected the entry is marked unavailable
rather than silently dropped, so the owner sees the gap). The pack is
one JSON document the owner can hand to a court, an ombudsman or the
Financial Ombudsman Service.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.schemas.brief import EvidenceDetail, EvidenceItem, EvidencePack
from app.services import google_connector as connector
from app.services.life import list_obligations, list_promises


def completeness_score(*, has_evidence: bool, has_due_date: bool, has_counterparty: bool) -> int:
    score = 0
    if has_evidence:
        score += 40
    if has_due_date:
        score += 30
    if has_counterparty:
        score += 30
    return score


def evidence_pack(
    user_id: str,
    include_closed: bool = False,
    *,
    _summary=None,
) -> EvidencePack:
    summary = _summary if _summary is not None else connector.gmail_summary
    items: list[EvidenceItem] = []
    rows: list[tuple[str, str, str, str, object | None, str, list[str]]] = []
    for item in list_obligations(user_id, include_closed=include_closed):
        rows.append(("obligation", item.id, item.title, "", item.due_date, item.status.value, list(item.evidence_ids or [])))
    for item in list_promises(user_id, include_closed=include_closed):
        rows.append(("promise", item.id, item.promise, item.counterparty, item.due_date, item.status.value, list(item.evidence_ids or [])))
    for kind, record_id, title, counterparty, due_date, status, evidence_ids in rows:
        evidence: list[EvidenceDetail] = []
        for message_id in evidence_ids:
            try:
                detail = summary(user_id, str(message_id))
                evidence.append(
                    EvidenceDetail(
                        message_id=str(message_id),
                        subject=detail.subject,
                        sender=detail.sender,
                        date=detail.date,
                        available=True,
                    )
                )
            except Exception:
                evidence.append(EvidenceDetail(message_id=str(message_id), available=False))
        items.append(
            EvidenceItem(
                kind=kind,
                id=record_id,
                title=title,
                counterparty=counterparty,
                due_date=due_date,
                status=status,
                completeness=completeness_score(
                    has_evidence=bool(evidence_ids),
                    has_due_date=due_date is not None,
                    has_counterparty=bool(counterparty) or kind == "obligation",
                ),
                evidence=evidence,
            )
        )
    return EvidencePack(
        generated_at=datetime.now(timezone.utc),
        items=items,
        total=len(items),
        complete=sum(1 for item in items if item.completeness == 100),
    )
