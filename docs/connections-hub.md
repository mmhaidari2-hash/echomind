# Connections hub — better than the reference, one surface of a wider product

Mahdi sent a reference (2026-11-26): a hub-and-spoke "connected apps"
screen — central logo, orbiting app icons, a "3 apps connected" pill,
green checkmarks. His correction: the image is ONLY an idea — "این یه
ایدست خودت بهترش رو بذار" — design something better, don't copy it.
And "مال ما گسترده تر از اینه" — EchoMind is BROADER than that app.

## Better than the reference

- **Design language**: the reference is a flat 2D orbit on a light
  card. The hub is EchoMind's own glassy 3D: a glass orb at the centre
  (`.echomind-orb-3d`, depth + glow), glass tiles with tilt on the
  spokes, glowing green lines for live connections, dim lines for the
  rest. Dark glass, not light green. No copied logo: the centre is
  EchoMind's own orb, not the reference's flower mark.
- **It answers "so what?"**: tapping an app shows what it POWERS —
  Gmail → Inbox Watch · Promise Chaser · Outcome Verifier; Calendar →
  Travel Guard · Calendar Guard · Morning Brief. The reference shows
  icons; the hub shows consequences.
- **It shows breadth, not just connections**: a strip under the orbit
  — "Part of the wider EchoMind" — lists the engines the hub feeds
  into (Life Graph, Obligation Engine, Promise Tracker, Outcome Loop,
  Project delegation) with the line that connections are one surface
  and deadlines, promises, outcomes and projects all meet in the Life
  Graph. The hub never reads as the whole product.

## Only real connectors

| App | State | How it is known |
|-----|-------|-----------------|
| Gmail | Real — connected iff the Google OAuth token is live AND the `gmail.readonly` scope is granted | `GET /connectors/google/status` |
| Calendar | Real — connected iff the token is live AND the `calendar.readonly` scope is granted | Same status call, per-scope |
| Drive | "Soon" — same Google account's next scope; no Drive code exists in the repo yet | Marked soon, never shown as connected |
| Docs | "Soon" — same as Drive | Marked soon |
| Sheets | "Soon" — same as Drive | Marked soon |

Slack, Notion and Instagram are **omitted**: the repo has no connector
for them and none is planned there. (Mahdi's Instagram is connected to
Muse, not to EchoMind — showing it here would be a mock.) If the
status call fails, the hub says "Connection status could not be read"
instead of showing a guess. The count pill counts only the actually
connected apps (0, 1 or 2).

## Files

- `frontend/src/app/components/ConnectionsHub.tsx` — the hub.
- `frontend/src/app/components/ContextDrawer.tsx` — mounted between
  LifeSummaryCard and GoogleConnectionsCard (the hub is the visual
  summary; the card underneath keeps the detail, scopes and
  disconnect). No existing screen was redesigned.
- No new backend endpoint: the hub reuses the existing
  `getGoogleConnectorStatus()` client and `startGoogleConnection()`
  for the Connect action.

## Verify

```bash
cd ~/workspace/echomind/.verify-fe && ./node_modules/.bin/tsc --noEmit
```

Typecheck only — the hub's live state needs a signed-in user with a
Google connection, which no test harness has. The "connected" branch
is verified by code reading (scope check against the same status
shape the existing GoogleConnectionsCard uses), not by a live run;
say so honestly. Visual rendering was not screenshot-verified: the
Playwright browser download was explicitly denied, so no screenshot
exists (see the final report).
