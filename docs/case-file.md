# Consumer Rights Case File

A case file turns a one-off rights evaluation into a case that lives in
the Life Graph: a case node, the two statutory deadlines, and the
obligations that guard them.

## Contract

- `POST /consumer-rights/cases` (same body as
  `POST /consumer-rights/notices`, plus optional
  `?evidence_ids=m1&evidence_ids=m2`) returns:
  - `case_node` — a Life Graph node (`kind: case`, label
    `Case — {item}`, attributes: retailer, pathway, remedy, price).
  - `pathway`, `pathway_label`, `recommended_remedy`, `notice_draft`,
    `statute_refs`, `next_steps` — from the existing rights engine
    (Consumer Rights Act 2015).
  - `deadlines`:
    - **30-day right to reject** — delivery + 30 days, only while the
      window is still open;
    - **burden shift** — delivery + 180 days (after six months the
      consumer must prove the fault existed at delivery).
  - `obligations` — one per deadline, linked to the case node
    (`related_node_ids`), with the evidence attached:
    `Reject faulty item — {item}` and `Gather proof — {item}`.
- Creating Life Graph records from the owner's own request is a normal
  write (like `POST /life/obligations`). Sending the notice to the
  retailer is NOT done here: that is an external action and goes
  through Bounded Authority.
- Owner-scoped: the case node and obligations appear only in the
  owner's snapshot.

## Files

- `backend/app/schemas/case_file.py`, `backend/app/services/case_file.py`
- `backend/app/api/endpoints/case_file.py`
- `backend/tests/test_case_file.py`
- Frontend: `api.ts` (`createCaseFile`).

## Verify

```bash
pytest backend/tests/test_case_file.py -q
```

Checks: both deadlines within 30 days (2026-11-12 → 2026-12-12 and
2027-05-11), only the burden deadline after 30 days, node + obligations
in the life snapshot, owner scoping.

## Why this beats the top ten

A general assistant can quote the Consumer Rights Act. EchoMind files
the case: the notice, the two dates that decide whether you get a
refund, and the obligations that make sure neither date passes while
you are busy. The case stays in your Life Graph with its evidence, so
the next time the retailer stalls, the whole history is one tap away.
