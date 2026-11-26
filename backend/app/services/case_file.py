"""Consumer Rights Case File: a case that lives in the Life Graph.

The rights engine already classifies the pathway and drafts the notice.
A case file keeps it: one case node (retailer, item, pathway, remedy),
the two statutory deadlines, and the obligations that guard them:

- the 30-day right to reject (only while the window is still open);
- the 6-month burden shift — after six months the consumer must prove
  the fault existed at delivery, so the proof-gathering obligation is
  due on that date.

Creating Life Graph records from the owner's own request is a normal
write (like POST /life/obligations). Sending the notice to the retailer
is not done here: that is an external action and goes through Bounded
Authority.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.schemas.case_file import CaseDeadline, CaseFile
from app.schemas.consumer_rights import ConsumerRightsRequest
from app.schemas.life import LifeNodeCreate, LifeNodeKind, ObligationCreate
from app.services.consumer_rights import evaluate_rights
from app.services.life import add_node, add_obligation

_REJECT_WINDOW_DAYS = 30
_BURDEN_SHIFT_DAYS = 180


def build_case_file(
    user_id: str,
    payload: ConsumerRightsRequest,
    evidence_ids: list[str] | None = None,
    today: date | None = None,
) -> CaseFile:
    result = evaluate_rights(payload, today)
    delivery = payload.delivery_date or payload.purchase_date
    evidence = list(evidence_ids or [])
    if payload.proof_filename and payload.proof_filename not in evidence:
        evidence.append(payload.proof_filename)

    node = add_node(
        user_id,
        LifeNodeCreate(
            kind=LifeNodeKind.case,
            label=f"Case — {payload.item_description}",
            attributes={
                "retailer": payload.retailer_name,
                "pathway": result.pathway.value,
                "remedy": result.recommended_remedy.value,
                "price_gbp": str(payload.purchase_price),
            },
        ),
    )
    deadlines: list[CaseDeadline] = []
    obligations = []
    if result.within_30_days:
        reject_end = delivery + timedelta(days=_REJECT_WINDOW_DAYS)
        deadlines.append(
            CaseDeadline(label="30-day right to reject ends", date=reject_end, kind="reject_window")
        )
        obligations.append(
            add_obligation(
                user_id,
                ObligationCreate(
                    title=f"Reject faulty item — {payload.item_description}",
                    due_date=reject_end,
                    source="consumer_rights",
                    related_node_ids=[node.id],
                    evidence_ids=evidence,
                    notes=f"{payload.retailer_name}. {result.pathway_label}.",
                ),
            )
        )
    burden_end = delivery + timedelta(days=_BURDEN_SHIFT_DAYS)
    deadlines.append(
        CaseDeadline(label="Burden of proof shifts to you", date=burden_end, kind="burden_shift")
    )
    obligations.append(
        add_obligation(
            user_id,
            ObligationCreate(
                title=f"Gather proof — {payload.item_description}",
                due_date=burden_end,
                source="consumer_rights",
                related_node_ids=[node.id],
                evidence_ids=evidence,
                notes="After 6 months you must prove the fault existed at delivery. Keep receipts, photos and the retailer's replies.",
            ),
        )
    )
    return CaseFile(
        case_node=node,
        pathway=result.pathway,
        pathway_label=result.pathway_label,
        recommended_remedy=result.recommended_remedy,
        notice_draft=result.notice_draft,
        deadlines=deadlines,
        obligations=obligations,
        statute_refs=result.statute_refs,
        next_steps=result.next_steps,
    )
