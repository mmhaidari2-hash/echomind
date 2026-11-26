# Model provider slots — GPT, Claude, Cursor + empty slots

Mahdi asked 2026-11-26 ~18:36 GMT: EchoMind must have slots for
GPT (ChatGPT), Claude and Cursor, plus a few empty slots he can fill
later himself. The registry is built; no provider works until its
key is supplied and a live call is verified — nothing is claimed.

## What was built

- **Backend** (`schemas/providers.py`, `services/providers.py`,
  `api/endpoints/providers.py`, registered in `api/v1/router.py`):
  an owner-scoped JSON store (same pattern as the Life Graph store),
  one record per user.
- **Slots**: three built-ins, always present —
  - **GPT (ChatGPT)** — `https://api.openai.com/v1`, model `gpt-4o`
  - **Claude** — `https://api.anthropic.com/v1`, model
    `claude-sonnet-4-5-20250929`
  - **Cursor** — endpoint and model **empty** (Cursor's API endpoint
    is not assumed; Mahdi fills it in when he has it)
  — plus **three empty custom slots**, seeded for every user and
  kept at three: filling one seeds another, so there is always room
  to add a provider. More can be added with `POST /providers`.
- **Keys**: Fernet-encrypted with the same `CONNECTOR_TOKEN_KEY`
  as the other connectors, stored server-side only. The API **never
  returns a key** — a slot only reports `has_key`. Setting a key
  needs the encryption key configured (503 otherwise).
- **Fail closed**: a slot with no key says "needs key", with no
  endpoint says "needs endpoint". Activating such a slot is refused
  (409); testing it is refused (409). Clearing a key (or endpoint)
  deactivates the slot. One slot is active per user at a time.
- **Test** (`POST /providers/{id}/test`): one cheap live call —
  `GET {endpoint}/models` — with the provider's own auth header
  (Bearer for OpenAI-compatible APIs, `x-api-key` +
  `anthropic-version` for Claude). A 200 means the key and endpoint
  work; any other status is reported with its status, never as a
  pass. No completion is sent, so the test costs nothing. An
  unreachable provider is a 502.
- **Frontend** (`components/ProvidersPanel.tsx`, mounted in the
  Context drawer's context tab after the Google connections card):
  every slot as a card with its status pill (Active / Ready / Needs
  key / Needs endpoint), editable model + endpoint, name field for
  custom slots, a password key input (never echoed back — only "Key
  set"), Save / Test / Set active / Remove (custom slots only), and
  an "Add another provider" button. Full EN/FA copy in `lib/copy.ts`
  (`providers*` keys), RTL unchanged.
- **API helpers** in `services/api.ts`: `listProviders`,
  `createProvider`, `updateProvider`, `deleteProvider`,
  `activateProvider`, `testProvider`.

## What still needs Mahdi

1. **API keys** — one per provider he wants live:
   - GPT: an OpenAI API key (platform.openai.com)
   - Claude: an Anthropic API key (console.anthropic.com)
   - Cursor: its API key **and** its API endpoint (not assumed)
   - Any custom slot: its key + endpoint + model
2. **Which provider is active** — pick one in the panel once a key
   is set; until then no provider is active and EchoMind does not
   claim any model answers.
3. **A live call verified** — after a key is set, "Test" must
   return 200 before the slot is called working. No live call has
   run yet: no key has been supplied.
4. **The merge** — none of this is live on the phone until
   `doodombeh/echomind-next` is merged (merge decision still
   unanswered).

## Tests

`backend/tests/test_providers.py` (11 tests): built-ins + three
empty slots, keys never leak in any response, set key → activate →
active, activation refused without a key and without an endpoint,
test refused without a key, test reports a live 200 and a 401
honestly (stubbed), Claude uses Anthropic headers, custom-slot
CRUD, built-in delete refused, clearing a key deactivates, keys are
owner-scoped.
