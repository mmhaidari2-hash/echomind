# Travel Guard

A calendar event that says "Flight to Edinburgh" is only a plan. The
guard cross-checks each upcoming trip-like event against the recent
Gmail and says whether the trip is actually booked.

## Contract

- `GET /travel/guard` — for every upcoming calendar event that looks
  like a trip (flight, train, hotel, airport, station, holiday, trip,
  booking, check-in, departure, arrival, ferry, coach):
  - **confirmed** — a booking/confirmation/itinerary/ticket message
    matches the same day or the same place;
  - **disruption** — a delay/cancellation/reschedule message matches
    it (a disruption beats a confirmation when both exist — the newest
    message wins in practice, and a disruption is the one that ruins
    the trip);
  - **missing_booking** — no message matches. The trip may not be
    booked at all.
  - Each result carries the `evidence_message_id` when there is one,
    and a plain-language `detail`.
- Fail-closed: Google not connected → 409; not configured → 503. The
  guard never reports "all clear" from an empty inbox.
- Deterministic keyword matching, no LLM. Owner-scoped.

## Files

- `backend/app/schemas/travel_guard.py` (shared with Calendar Guard),
  `backend/app/services/travel_guard.py`
- `backend/app/api/endpoints/travel_guard.py`
- `backend/tests/test_travel_guard.py`
- Frontend: `api.ts` (`getTravelGuard`).

## Verify

```bash
pytest backend/tests/test_travel_guard.py -q
```

Checks: confirmed / missing_booking / disruption, disruption beats
confirmation, non-trip events ignored, fail-closed without Google.

## Why this beats the top ten

Travel assistants confirm bookings when you ask. EchoMind checks them
before you ask — because the failure mode is not "I forgot to check",
it is "I assumed it was booked". The guard catches the assumption.
