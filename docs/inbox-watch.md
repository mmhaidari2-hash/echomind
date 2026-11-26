# Inbox Watch — Gmail-driven Obligation Engine detection

**Branch:** `doodombeh/echomind-next` (from `main` 7565ead)
**Status:** Implemented, awaiting CI verification (see below).

## What it proves

The Obligation Engine's job (MASTER_BOOK differentiator #2) is to detect
deadlines, rights, renewals and refunds **before the user remembers them**.
Until this change every obligation in EchoMind was hand-entered. Inbox Watch
closes that gap: it reads the owner's recent Gmail and proposes obligations
and promises with their evidence attached.

## Flow (Outcome Loop)

1. **Detect** — `GET /api/v1/life/detect` scans Gmail from the last 30 days
   (`gmail.readonly`, no new scope) with deterministic rules:
   - train delay/cancellation → Delay Repay obligation, due 28 days after
     the journey (National Rail rule, `CLAIM_DEADLINE_DAYS`), with the
     operator's claim form URL when recognised;
   - payment-due email → payment obligation, due date parsed when stated;
   - refund issued/on its way → promise from that company;
   - renewal notice → renewal obligation.
   A proposal is never created from an email automatically.
2. **Confirm** — the app proposes the obligation through Bounded Authority
   (`POST /authority/actions`, tool `life.create_obligation` or
   `life.create_promise`, idempotency key = proposal id) and the owner
   confirms it (`POST /authority/actions/{id}/confirm`). The action is
   audited; confirming twice is a no-op; an unknown tool is rejected.
3. **Act / verify / follow up** — the accepted obligation enters the Life
   Graph and the `/outcomes` queue (urgent/soon/watch), which the Life card
   now shows under "Needs follow-up" for the first time.

## Truthfulness rules

- Detectors are rules over subject/sender/snippet, never an LLM: a deadline
  must never be hallucinated.
- When a message does not state the underlying date, the due date is
  estimated from the email date and marked `due_date_estimated: true`, and
  the reason text says so.
- If Google is not connected the scan answers 409 (not an empty list).
  The app shows "Connect Google first" instead of pretending nothing exists.
- Already-recorded proposals come back as `already_recorded`; dismissed ones
  as `dismissed` and are not re-proposed.

## Files

- `backend/app/schemas/detection.py` — proposal/scan schemas.
- `backend/app/services/detection.py` — detectors + scan glue.
- `backend/app/api/endpoints/detection.py` — `GET /life/detect`,
  `POST /life/detect/{proposal_id}/dismiss`.
- `backend/app/services/life.py` — dismissed-proposal set + recorded
  evidence ids (additive).
- `backend/app/services/tool_registry.py` — `life.create_obligation`,
  `life.create_promise` tools (additive).
- `backend/app/api/v1/router.py` — mounts the detection router.
- `backend/tests/test_detection.py` — detectors, scan endpoint, authority
  accept path, idempotency, dismissal, owner isolation, restart persistence.
- `frontend/src/services/api.ts` — detection client + existing authority
  client reused for accept.
- `frontend/src/app/components/LifeSummaryCard.tsx` — "Check inbox" button,
  proposals list with Add/Dismiss, "Needs follow-up" from `/outcomes`.

## Verification (not yet executed)

Local execution of the repo is blocked in this environment (execution-risk
check on the cloned tree), and the GitHub App cannot create branches
(403 on `git/refs`), so this branch could not be pushed or CI-run yet.
After the branch exists and the files are pushed:

```bash
# in GitHub Actions, on branch doodombeh/echomind-next:
# - backend-tests.yml (workflow_dispatch) — pytest, incl. test_detection.py
# - android-apk.yml (workflow_dispatch) — Next export + debug APK
```

## Still needs Mahdi

- Create branch `doodombeh/echomind-next` from `main` (or grant the GitHub
  App branch-creation permission) so the files can be pushed.
- Google account connected in EchoMind (read scope) to see a real scan;
  without it the scan truthfully reports "not connected".
- No new secret is needed: detection uses the existing `gmail.readonly`
  scope and no Gemini key.
