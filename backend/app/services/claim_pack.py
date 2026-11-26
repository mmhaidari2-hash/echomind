"""Delay Repay Claim Pack: everything needed to file, in one call.

The existing claim evaluator already works out the tier, the estimate and
the draft letter. The pack adds the parts that turn a calculation into a
finished filing: the real filing deadline (journey date + 28 days, the
operator rule), the operator's claim page, an evidence checklist, and the
filing obligation the owner can record in the Life Graph through Bounded
Authority. No new eligibility logic: the evaluator stays the single
source of truth for the money.
"""

from __future__ import annotations

from datetime import timedelta

from app.schemas.claim_pack import ClaimPack
from app.schemas.delay_repay import DelayRepayClaimRequest
from app.services.delay_repay import CLAIM_DEADLINE_DAYS, evaluate_claim


def build_claim_pack(
    payload: DelayRepayClaimRequest, evidence_message_id: str | None = None
) -> ClaimPack:
    base = evaluate_claim(payload)
    if payload.journey_date is not None:
        deadline = payload.journey_date + timedelta(days=CLAIM_DEADLINE_DAYS)
        deadline_estimated = False
    else:
        deadline = None
        deadline_estimated = True

    checklist = ["Ticket or booking reference", "Proof of the delay (screenshot, email or departure board)"]
    if payload.ticket_reference:
        checklist[0] = f"Ticket or booking reference: {payload.ticket_reference}"
    if payload.proof_filename:
        checklist.append(f"Uploaded proof: {payload.proof_filename}")
    if evidence_message_id:
        checklist.append(f"Gmail evidence message: {evidence_message_id}")
    checklist.append("Bank details for the compensation payment")

    filing_obligation: dict[str, object] = {
        "title": f"File Delay Repay — {base.operator_name}",
        "due_date": deadline.isoformat() if deadline is not None else None,
        "source": "delay_repay",
        "notes": (
            f"Estimated £{base.estimate_gbp} ({base.percent}% of £{base.basis_amount}). "
            f"File within {CLAIM_DEADLINE_DAYS} days of the journey."
        ),
        "evidence_ids": [evidence_message_id] if evidence_message_id else [],
    }
    next_steps = list(base.next_steps)
    if deadline is not None:
        next_steps.insert(0, f"File by {deadline.isoformat()} (28 days after the journey).")
    else:
        next_steps.insert(0, "Add the journey date to see your exact filing deadline.")
    data = base.model_dump()
    data["filing_deadline"] = deadline
    data["filing_deadline_estimated"] = deadline_estimated
    data["evidence_checklist"] = checklist
    data["filing_obligation"] = filing_obligation
    data["next_steps"] = next_steps
    return ClaimPack(**data)
