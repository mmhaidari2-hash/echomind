# Promise Chaser

A promise without a chase is just a note. The Chaser computes the
follow-up cadence for every open promise and drafts the chase email for
each step. It never sends anything itself.

## Contract

- `GET /life/promises/{id}/followups` — the four steps for one promise:
  - **check** — 3 days before the due date ("is this on track?")
  - **verify** — on the due date ("did it happen?")
  - **chase** — 7 days after the due date (polite chase, evidence named)
  - **escalate** — 14 days after the due date (formal chase, next step named)
  - A promise with no due date gets a single open "check" step with no date.
  - Each step carries `state`: `upcoming` / `due` / `overdue`, computed from today.
- `POST /life/promises/{id}/followups/{step}/draft` — the draft email for
  that step (`to`, `subject`, `body`, `to_missing`) plus the Bounded
  Authority proposal that would send it (`tool: gmail.send`, idempotency
  key `followup:{promise_id}:{step}`). The recipient is taken from the
  request body, else from the evidence message sender, else left empty
  with `to_missing: true` — the owner fills it in.
- Drafts are bilingual: `locale=en|fa` in the request body.
- A closed promise (kept/broken/cancelled) returns 409. An unknown
  promise, or one owned by another user, returns 404.
- Sending goes through the existing authority flow: propose, then the
  owner confirms. The draft endpoint itself sends nothing.

## Files

- `backend/app/schemas/followup.py`, `backend/app/services/followup.py`
- `backend/app/api/endpoints/followup.py`
- `backend/tests/test_followup.py`
- Frontend: `frontend/src/services/api.ts` (`getPromiseFollowups`,
  `draftPromiseFollowup`), `LifeSummaryCard` "Follow up" button + draft
  panel on each open promise.

## Verify

```bash
pytest backend/tests/test_followup.py -q
```

Checks: cadence dates (due−3 / due / due+7 / due+14), overdue states,
no-date promise, draft content (counterparty, promise, due date),
recipient from evidence sender, Persian draft, owner scoping, 409 for a
closed promise, and that the draft endpoint creates no authority action
(it only returns the proposal).

## Why this beats the top ten

ChatGPT/Claude/Gemini remember what you told them; none of them chase a
company for you on a schedule. The Chaser is a *cadence*, not a reminder:
it knows the difference between checking before the date, verifying on
the date, chasing a week late, and escalating a fortnight late — and it
drafts the right email for each step, with the evidence attached.
