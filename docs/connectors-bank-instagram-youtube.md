# Connectors: Bank (TrueLayer), Instagram, YouTube

Three real connectors, built to the same shape as the repo's Google
connector: service (Fernet-encrypted per-user token store) + schemas +
endpoint + status. All three show their **real** status on the home hub
from their status endpoints — never a mock checkmark.

## Bank — UK Open Banking via TrueLayer (read-only)

- Service: `backend/app/services/truelayer_connector.py`
- Endpoints: `backend/app/api/endpoints/bank.py`
  (`/connectors/bank/status|start|callback|accounts|accounts/{id}/transactions`,
  DELETE to disconnect)
- Schemas: `BankConnectorStatus`, `BankConnectStart`, `BankAccount`,
  `BankTransaction` in `backend/app/schemas/connectors.py`

How it works: the owner taps Connect on the hub, EchoMind opens
TrueLayer's authorisation page, the owner picks their bank and approves
the consent on the **bank's own screen** (TrueLayer never sees the
bank login, EchoMind never sees it either). The callback exchanges the
code for an access token (Fernet-encrypted, per user). Reads:
accounts (+ balance) and transactions. Sandbox by default
(`auth.truelayer-sandbox.com`); `TRUELAYER_ENV=live` switches to the
live bases.

**No payments.** There is deliberately no payment route, no payment
function, and no payment scope. Moving money needs a separate,
explicitly confirmed flow that is not built here. The test suite
asserts `POST /connectors/bank/payments` is 404.

Settings: `TRUELAYER_CLIENT_ID`, `TRUELAYER_CLIENT_SECRET`,
`TRUELAYER_REDIRECT_URI`, `TRUELAYER_ENV` (sandbox|live, default
sandbox). Also needs `CONNECTOR_TOKEN_KEY` (a Fernet key, same as the
Google connector).

What the owner still needs: a TrueLayer account + client credentials
(free sandbox first; live needs TrueLayer onboarding). Until then the
hub shows Bank as "needs setup" and says exactly that.

## Instagram — Instagram API with Instagram Login (read-only)

- Service: `backend/app/services/instagram_connector.py`
- Endpoints: `backend/app/api/endpoints/instagram.py`
  (`/connectors/instagram/status|start|callback|profile|media`, DELETE)
- Schemas: `InstagramConnectorStatus`, `InstagramConnectStart`,
  `InstagramProfile`, `InstagramMediaItem`

How it works: OAuth with Instagram Login, permission
`instagram_business_basic` (read profile + media). The short-lived
token is exchanged for a long-lived token (~60 days) and refreshed
when it is close to expiry. Reads: profile (`/me`) and recent media
(`/me/media`). Tokens are Fernet-encrypted per user, in their own
store (`instagram.json`).

Settings: `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET`,
`INSTAGRAM_REDIRECT_URI`. Also needs `CONNECTOR_TOKEN_KEY`.

What the owner still needs: a Meta app with Instagram Login enabled +
its client id/secret/redirect URI. Until then the hub shows Instagram
as "needs setup". Note: Instagram being connected to Muse is a
different connection — it does not make EchoMind connected.

## YouTube — Google OAuth, youtube.readonly (read-only)

- Service: `backend/app/services/youtube_connector.py`
- Endpoints: `backend/app/api/endpoints/youtube.py`
  (`/connectors/youtube/status|start|channel|videos`)
- Schemas: `YouTubeConnectorStatus`, `YouTubeConnectStart`,
  `YouTubeChannel`, `YouTubeVideo`

How it works: YouTube rides the **shared Google token** (same
mechanism as the repo's Google connector). `begin()` requests Google
OAuth with the extra scope `https://www.googleapis.com/auth/youtube.readonly`
via the new `?scopes=` parameter on the Google start endpoint; the
granted scopes are stored on the shared token. Status is "connected"
only when the token exists **and** the YouTube scope was granted.
Reads: channel (`channels.list?mine=true`) and recent uploads
(`playlistItems` on the uploads playlist). No separate callback and no
separate disconnect — disconnecting Google disconnects YouTube.

Settings: the Google connector's settings (`GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `CONNECTOR_TOKEN_KEY`).
No separate YouTube key.

What the owner still needs: nothing new — a Google sign-in with the
YouTube scope granted (tap "Request access" on the hub). The YouTube
Data API v3 must be enabled on the Google Cloud project that owns the
OAuth client.

## Tests

- `backend/tests/test_instagram_connector.py` (4 tests)
- `backend/tests/test_youtube_connector.py` (5 tests)
- `backend/tests/test_bank_connector.py` (6 tests, incl. "no payment
  route")
- `backend/tests/test_connectors.py` (+1 test for the Google
  `?scopes=` parameter)

Every connector is tested fail-closed: unconfigured → 503 on start,
unconnected → 409 on reads, bad OAuth state → 403. HTTP is stubbed in
tests; **no live OAuth flow has run** (no Meta app, no TrueLayer
account, no live Google consent with the YouTube scope in hand), so
the first real connect for each service is still unproven until the
owner tries it.
