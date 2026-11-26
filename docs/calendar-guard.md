# Calendar Guard

Two checks on the owner's upcoming calendar, both deterministic:

- **overlap** — two timed events on the same day whose times intersect;
- **travel risk** — two timed events in different non-empty locations
  with less than 60 minutes between them.

## Contract

- `GET /calendar/guard` returns `conflicts` (each with `type`,
  `event_ids`, `titles`, `detail`) and `checked_events`.
- Back-to-back events (one ends when the next starts) do not conflict.
- A gap of 60 minutes or more is not a travel risk. A missing location
  on either side is not a travel risk — the guard does not guess where
  you are.
- All-day events (date-only start/end) are skipped: they have no time
  to conflict with.
- Fail-closed: Google not connected → 409; not configured → 503.
- Needs the `location` field on `CalendarEventSummary` (added
  additively, default `""`) and the connector now populating it from
  Google Calendar (`item.location`). No other connector change.

## Files

- `backend/app/schemas/connectors.py` — additive `location` field
- `backend/app/services/google_connector.py` — populate `location` in
  `upcoming_calendar`; additive public `gmail_summary` wrapper
  (used by the Evidence Locker)
- `backend/app/schemas/travel_guard.py` (shared schemas),
  `backend/app/services/calendar_guard.py`
- `backend/app/api/endpoints/calendar_guard.py`
- `backend/tests/test_travel_guard.py`
- Frontend: `api.ts` (`getCalendarGuard`).

## Verify

```bash
pytest backend/tests/test_travel_guard.py -q
```

Checks: overlap, back-to-back (no conflict), 30-minute travel risk
with the gap named, ≥60 minutes (no risk), missing location (no risk),
all-day events skipped, fail-closed without Google.

## Why this beats the top ten

Calendar apps show you the clash after you made it. EchoMind checks
the diary against itself — including the travel between two places —
before the day arrives, and it does it with the locations your calendar
already has, not with a location permission it does not need.
