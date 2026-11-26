# Morning Brief

One deterministic daily digest, ranked by urgency, in the owner's
language. No LLM, no generated prose beyond fixed templates, nothing
invented: every line names the record it came from.

## Contract

- `GET /brief/today?locale=en|fa` returns:
  - `date`, `locale`, `counts` (overdue / due_today / due_soon /
    promises / events_today / alerts);
  - `items` ranked by fixed priority:
    1. overdue obligations;
    2. obligations and promises due today;
    3. obligations due soon;
    4. promises coming due;
    5. today's calendar events;
    6. urgent/soon notification alerts.
- Calendar and alerts are best-effort: when Google is not connected
  the brief simply has no events section — the obligations and promises
  (the owner's own data) are always there.
- Bilingual: `reason` strings are English or Persian per `locale`.
- Read-only, owner-scoped.

## Files

- `backend/app/schemas/brief.py` (shared with Evidence Locker),
  `backend/app/services/briefing.py`
- `backend/app/api/endpoints/brief.py`
- `backend/tests/test_brief_evidence.py`
- Frontend: `api.ts` (`getMorningBrief`), `LifeSummaryCard` "Today"
  section (top 3 items).

## Verify

```bash
pytest backend/tests/test_brief_evidence.py -q
```

Checks: ranking (overdue before due-today), counts, empty brief,
owner scoping, Persian reasons.

## Why this beats the top ten

Every assistant can summarise your day if you ask. The brief is the
opposite of a summary: it is a ranked list of what needs you, built
from obligations, promises, calendar and alerts — the things that have
consequences if you miss them — and it is there before you ask, in your
language.
