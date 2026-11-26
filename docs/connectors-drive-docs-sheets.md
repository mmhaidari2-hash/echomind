# Connectors: Drive, Docs, Sheets (Google, read-only)

The three file connectors, built to the same shape as the repo's
Google connector and the Drive connector from the gaps run: service
(Fernet-encrypted per-user token store, shared Google token) +
schemas + endpoint + status. All three show their **real** status on
the home hub from the per-scope Google status
(`GET /connectors/google/status`) — never a mock checkmark, never
"(soon)": each is genuinely connectable the moment the scope is
granted. The "(soon)" markers Mahdi saw on his phone belonged to the
old production build; the staging hub already renders the real
states, and the phone shows them after the merge.

## Drive — `drive.readonly`

- Service: `backend/app/services/drive_connector.py`
- Endpoints: `backend/app/api/endpoints/drive.py`
  (`/connectors/drive/status|start|search|files/{id}`)
- Schemas: `DriveFile`, `DriveFileRead` in `backend/app/schemas/drive.py`

Reads: search files by name and full text; read text content. Google
Docs export as plain text; plain-text files (txt, md, json, csv) read
directly. Anything else (images, PDFs, sheets, binaries) is refused
with the reason. Content capped at 8,000 characters.

## Docs — `documents.readonly`

- Service: `backend/app/services/docs_connector.py`
- Endpoints: `backend/app/api/endpoints/docs.py`
  (`/connectors/docs/status|start|search|documents/{id}`)
- Schemas: `DocRead` in `backend/app/schemas/docs.py` (search returns
  `DriveFile` rows)

Reads: search Google Docs by name; read a document's text through
the **Docs API** — paragraphs and table cells, in order, capped at
8,000 characters. This is the scope the hub's Docs app grants: the
Drive connector reads Docs too (through Drive export), but only this
connector consumes the `documents.readonly` scope. A document's text
is the claim letter / case file the hub promises for Docs.

## Sheets — `spreadsheets.readonly`

- Service: `backend/app/services/sheets_connector.py`
- Endpoints: `backend/app/api/endpoints/sheets.py`
  (`/connectors/sheets/status|start|search|spreadsheets/{id}|spreadsheets/{id}/tabs`)
- Schemas: `SheetTab`, `SheetValues` in `backend/app/schemas/sheets.py`
  (search returns `DriveFile` rows)

Reads: search spreadsheets by name; list a spreadsheet's tabs; read
a tab's values (first tab by default, `A1:Z500`, or any `range`
given). Values come back as rows of strings — the costs-and-renewals
ledger the hub promises for Sheets (refunds, claims, renewals
tracked in rows) — capped at 8,000 serialised characters and 500
rows.

## The scope detail (read this before connecting)

- **Search needs Drive too.** Searching lists files through the
  Drive API, so `begin()` for Docs and Sheets requests **both**
  scopes together (`documents.readonly` + `drive.readonly`,
  `spreadsheets.readonly` + `drive.readonly`). Reading a document
  needs only `documents.readonly`; reading values needs only
  `spreadsheets.readonly`. Status is "connected" only when the
  token exists **and** the connector's own scope was granted.
- **Connect flow:** the hub's Connect / "Request access" button calls
  `POST /connectors/google/start?scopes=<scope URL>` (the existing
  `?scopes=` parameter — only `https://` scope URLs are accepted)
  and opens Google's consent screen; the granted scopes land on the
  shared token. No separate callback and no separate disconnect —
  disconnecting Google disconnects all three.
- **Hub honesty fix in this change:** Drive/Docs/Sheets now carry
  the same setup note as Gmail/Calendar ("Google sign-in needs to be
  set up on the server first"), and the Connect button no longer
  appears when the Google connector is not configured on the server
  — before this fix it appeared and could only answer 503. The hub
  loads `googleConfigured` from the same status call and gates the
  button on it.

## Settings

The Google connector's settings (`GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `CONNECTOR_TOKEN_KEY`).
No separate key per connector.

## What the owner still needs

1. **The merge.** The production backend still runs `main`, so none
   of this is live on the phone until `doodombeh/echomind-next` is
   merged (merge decision still unanswered).
2. **Three APIs enabled on the Google Cloud project** that owns the
   OAuth client: **Drive API**, **Google Docs API**, **Google Sheets
   API**. (Drive was already needed for the Drive connector; Docs and
   Sheets are new.)
3. **Grant the scopes at sign-in**: `drive.readonly`,
   `documents.readonly`, `spreadsheets.readonly` — tap "Request
   access" on each hub app and approve Google's consent screen.

## Tests

- `backend/tests/test_drive_connector.py` (7 tests, pre-existing)
- `backend/tests/test_docs_connector.py` (6 tests: fail-closed when
  unconfigured, connected only with the Docs scope, start requests
  both scopes, reads fail closed without the scope, search + read
  with paragraphs and table cells, 8,000-char truncation)
- `backend/tests/test_sheets_connector.py` (6 tests: fail-closed when
  unconfigured, connected only with the Sheets scope, start requests
  both scopes, reads fail closed without the scope, search + tabs +
  read values, truncation)

Every connector is tested fail-closed: unconfigured → 503 on start,
unconnected → 409 on reads. HTTP is stubbed in tests; **no live
OAuth flow has run** (no live Google consent with these scopes in
hand), so the first real connect for each service is still unproven
until the owner tries it.
