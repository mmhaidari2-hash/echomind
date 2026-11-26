# Outcome Verifier

The Outcome Loop ends with "verify". The Verifier checks whether an
obligation or a promise actually happened, against the owner's Gmail,
with deterministic signals — no LLM, no guessing.

## Contract

- `POST /outcomes/verify` `{kind: "obligation"|"promise", source_id}` —
  scans the last 20 Gmail messages (newest first) and returns:
  - **verified** — a message says the thing happened (claim approved,
    payment received, refund in your account, renewal confirmed, work
    completed);
  - **failed** — a message says it did not happen (claim rejected,
    payment failed, not eligible);
  - **awaiting** — no matching message. The outcome is still open, not
    a lie.
- A signal only counts when it names the same counterparty/operator or
  the same kind of outcome, so an unrelated rejection in the inbox does
  not mark a promise broken. A refund counts as verified only when the
  money arrived ("refund has been paid"), not when it is "on its way".
- The result is persisted in the Life Graph (`verifications` bucket) and
  survives restart.
- `GET /outcomes/{source_id}/verification` — the last stored result, or
  404 when nothing was ever checked.
- Fail-closed: Google not connected → 409; not configured → 503. Unknown
  record → 404. Owner-scoped throughout.

## Files

- `backend/app/schemas/verification.py`, `backend/app/services/verification.py`
- `backend/app/api/endpoints/verification.py`
- `backend/app/services/life.py` — additive `verifications` bucket +
  `record_verification` / `get_verification`
- `backend/tests/test_verification.py`
- Frontend: `api.ts` (`verifyOutcome`, `getStoredVerification`),
  `LifeSummaryCard` "Verify" button on each obligation.

## Verify

```bash
pytest backend/tests/test_verification.py -q
```

Checks: verified/failed/awaiting signals, the unrelated-rejection
guard, the refund-arrived-only rule, persistence + owner scoping, 404
for an unknown record, 409/503 without Google.

## Why this beats the top ten

Every assistant says "I'll follow up". None of them closes the loop by
proving the outcome happened. The Verifier turns a promise into a fact
with the evidence message attached — the difference between a chatbot
that answers and an assistant that finishes.
