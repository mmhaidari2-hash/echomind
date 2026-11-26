# Evidence Locker

Every obligation and promise with a completeness score and the evidence
behind it, exportable as one JSON pack for a court, an ombudsman or the
Financial Ombudsman Service.

## Contract

- `GET /life/evidence-pack?include_closed=false` returns:
  - `generated_at`, `total`, `complete` (records scoring 100);
  - per record: `kind`, `id`, `title`, `counterparty`, `due_date`,
    `status`, `completeness` (0–100), `evidence` (list of
    `{message_id, subject, sender, date, available}`).
- Completeness scoring (fixed, documented, no judgement):
  - 40 points — evidence attached at all;
  - 30 points — a due date;
  - 30 points — the other party (counterparty) or, for obligations, a
    named title.
- Evidence details are fetched from Gmail best-effort through the
  additive `gmail_summary` connector wrapper. When Google is not
  connected, or a message cannot be fetched, the entry is marked
  `available: false` — never silently dropped, so the owner sees the
  gap instead of a pack that looks complete and is not.
- Read-only, owner-scoped.

## Files

- `backend/app/schemas/brief.py` (shared schemas),
  `backend/app/services/evidence.py`
- `backend/app/api/endpoints/evidence.py`
- `backend/app/services/google_connector.py` — additive public
  `gmail_summary` wrapper
- `backend/tests/test_brief_evidence.py`
- Frontend: `api.ts` (`getEvidencePack`).

## Verify

```bash
pytest backend/tests/test_brief_evidence.py -q
```

Checks: scoring weights (100 / 60 / 0), unavailable evidence marked
(not dropped), details fetched when Google answers, owner scoping.

## Why this beats the top ten

Memory layers (mem0, Khoj, Rewind) remember what you said. The locker
remembers what you can *prove*: every obligation and promise with its
evidence and a score for how complete the proof is. When a company says
"we never promised that", the answer is one export away — not a search
through your inbox.
