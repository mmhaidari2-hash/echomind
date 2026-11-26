# Renewal Guard

Subscriptions and policies renew quietly and charge loudly. The guard
finds renewal obligations in the Life Graph and turns each one into a
decision with a deadline and a price.

## Contract

- `GET /life/renewals` — read-only. For every open renewal obligation:
  - `renewal_date` — the obligation's due date;
  - `decision_deadline` — 7 days before the renewal, so the owner
    still has time to cancel or switch;
  - `annual_cost_gbp` — parsed from £ amounts in the title/notes.
    Monthly amounts are annualised (×12). Thousands separators are
    handled (`£1,200` = 1200, not 1.20).
  - `actions` — keep / cancel / switch, each with one concrete line
    on how to do it;
  - `calendar_blocker` — the Bounded Authority proposal
    (`calendar.event.create`) for the decision day, with idempotency
    key `renewal-decision:{obligation_id}`. Nothing is created from
    here: the owner proposes and confirms it.
- `total_annual_cost_gbp` — the sum across all renewals, so the owner
  sees what "let it renew" costs in a year.
- Renewals without a date have no deadline or blocker, but their cost
  still counts. Non-renewal obligations are ignored. Owner-scoped.

## Files

- `backend/app/schemas/renewals.py`, `backend/app/services/renewals.py`
- `backend/app/api/endpoints/renewals.py`
- `backend/tests/test_renewals.py`
- Frontend: `api.ts` (`getRenewals`).

## Verify

```bash
pytest backend/tests/test_renewals.py -q
```

Checks: decision deadline math, monthly annualisation, thousands
separator, non-renewal exclusion, no-date handling, owner scoping.

## Why this beats the top ten

Banks and budgeting apps show you the subscription. None of them tell
you the *decision* date — the last day you can still cancel — with the
annual cost and a calendar blocker in the same place. The guard does
not manage subscriptions; it makes the decision visible before the
money leaves.
