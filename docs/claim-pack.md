# Delay Repay Claim Pack

One call returns everything needed to file a Delay Repay claim. The
existing claim evaluator stays the single source of truth for the money
(tier, estimate, draft letter); the pack adds the parts that turn a
calculation into a finished filing.

## Contract

- `POST /delay-repay/pack?evidence_message_id=...` (same request body
  as `POST /delay-repay/claims`) returns the claim response plus:
  - `filing_deadline` — journey date + 28 days (the operator rule).
    `filing_deadline_estimated: true` and `filing_deadline: null` when
    no journey date was given, with a next step telling the owner to
    add the date.
  - `claim_url` — the operator's claim page (from the existing
    operator table).
  - `evidence_checklist` — ticket/booking reference, proof of the
    delay, the Gmail evidence message when given, bank details.
  - `filing_obligation` — the Life Graph obligation payload
    (`title`, `due_date`, `source: "delay_repay"`, `notes` with the
    estimate, `evidence_ids`) the owner can record through Bounded
    Authority. The pack does not create it.
- Like `/claims` it needs no login: the obligation itself is created by
  the owner through the authenticated authority flow.
- An ineligible journey (under 15 minutes) still gets a pack with a
  zero estimate — the owner sees why, not just "no".

## Files

- `backend/app/schemas/claim_pack.py`, `backend/app/services/claim_pack.py`
- `backend/app/api/endpoints/claim_pack.py`
- `backend/tests/test_claim_pack.py`
- Frontend: `api.ts` (`getClaimPack`).

## Verify

```bash
pytest backend/tests/test_claim_pack.py -q
```

Checks: deadline math (journey + 28 days), no-date handling, checklist
contents, filing obligation payload, ineligible journey, endpoint shape.

## Why this beats the top ten

A general assistant can look up Delay Repay rules. None of them hands
you the filing deadline, the operator's claim page, the evidence list
and the obligation that makes sure you file on time — in one call, with
the money already calculated. The pack is the difference between
knowing the rule and filing the claim.
