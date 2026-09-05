# EchoMind Master Specification

**Product:** EchoMind Assistant  
**Type:** Installable progressive web app (PWA) with a FastAPI control plane  
**LLM:** Google Gemini  
**Visual baseline:** Dark canvas `#090d16`, standalone display  
**Document status:** Source of truth for architecture, stack, and the 20-phase roadmap  

This file is the contract for every subsequent phase. Implementation work must follow the phase order, keep the monorepo split (`backend/` / `frontend/`), and treat later phases as additive—not as rewrites of earlier contracts unless this spec is updated first.

---

## 1. Product vision

EchoMind is a personal AI assistant that feels native on phone and desktop: installable, dark, fast, and always a tap away. The assistant is powered by Gemini, orchestrated by a Python API, and presented through a Next.js App Router client.

The product is not a generic chatbot wrapper. It is a **memory-aware, voice-capable, tool-using assistant** with a durable conversation model, a strict API versioning scheme, and a PWA shell that can be installed to the home screen.

### 1.1 Primary user outcomes

- Talk to EchoMind in text (and later voice) with low-latency streaming replies.
- Resume prior conversations with consistent identity and memory.
- Install the app and use it in standalone mode with the `#090d16` chrome.
- Trust that secrets stay on the server; the browser never holds `GEMINI_API_KEY`.

### 1.2 Non-goals (v1)

- Native iOS/Android store apps (PWA first).
- Self-hosted open-weight models as the default path (Gemini is the production LLM).
- Multi-tenant SaaS billing in the first 20 phases (auth exists; commercial packaging is out of scope).

---

## 2. Technical stack

### 2.1 Backend

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Python 3.11+ | Async-first |
| HTTP framework | FastAPI `>=0.110.0` | OpenAPI generated from routes |
| ASGI server | Uvicorn `>=0.28.0` | Reload in development |
| Settings | Pydantic Settings `>=2.2.1` | `BaseSettings` in `app/config.py` |
| Env loading | `python-dotenv >=1.0.1` | `.env` never committed |
| LLM | Google Gemini | Key via `GEMINI_API_KEY` |
| Validation | Pydantic v2 models | Request/response schemas per router |
| CORS | FastAPI `CORSMiddleware` | Frontend origin allowlist |

**Planned backend additions (later phases, not Phase 1):** SQLAlchemy or an equivalent persistence layer, Alembic migrations, Redis (rate limit / session cache), a streaming SSE (or WebSocket) chat channel, and a Gemini SDK client module.

### 2.2 Frontend

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 14 App Router | `src/app/` |
| UI library | React 18 | Client components only where interactivity requires them |
| Language | TypeScript | Strict mode |
| Styling | Tailwind CSS + Autoprefixer | Global canvas `#090d16` |
| PWA | `public/manifest.json` | Name: **EchoMind Assistant**; `display: standalone`; background `#090d16` |
| Theme | `#090d16` | Manifest `theme_color` and Next.js viewport theme color |
| Bundling | Next SWC | `reactStrictMode: true`, `swcMinify: true` |

**Planned frontend additions (later phases, not Phase 1):** service worker / Workbox, chat transcript UI, voice capture, settings panel, install prompt, and a typed API client generated from FastAPI OpenAPI.

### 2.3 Monorepo layout

```text
echomind/
├── ECHOMIND_MASTER_SPEC.md    # this document
├── backend/
│   ├── .env.example
│   ├── requirements.txt
│   └── app/
│       ├── config.py
│       └── main.py
└── frontend/
    ├── package.json
    ├── next.config.js
    ├── public/
    │   └── manifest.json
    └── src/app/
        ├── globals.css
        ├── layout.tsx
        └── page.tsx
```

Later phases add routers, services, tests, and UI modules **inside** these two roots. Do not introduce additional top-level apps without updating this spec.

### 2.4 Configuration contract

Backend settings (Pydantic `BaseSettings`):

| Key | Purpose |
|---|---|
| `PROJECT_NAME` | Service display name (default `EchoMind`) |
| `VERSION` | API/semver string |
| `API_V1_STR` | Version prefix (default `/api/v1`) |
| `GEMINI_API_KEY` | Server-side Gemini credential |

All versioned HTTP routes live under `API_V1_STR`. The unversioned root `/` is reserved for liveness (`status: online`). Health checks live at `{API_V1_STR}/health`.

### 2.5 Design tokens (locked)

| Token | Value | Usage |
|---|---|---|
| Canvas / PWA background | `#090d16` | `html`/`body`, manifest `background_color`, theme color |
| Display mode | `standalone` | Web app manifest |
| Product name | `EchoMind Assistant` | Manifest `name`, document title |

---

## 3. Architectural principles

1. **API-first.** The Next.js app is a client of FastAPI. Gemini is never called from the browser.
2. **Version in the path.** Breaking API changes require `/api/v2`; v1 remains stable during a migration window.
3. **Settings, not scattered `os.getenv`.** Runtime config is a Pydantic settings object.
4. **Streaming as a first-class transport** for assistant tokens (Phase 6), with a non-streaming fallback.
5. **PWA is a product surface**, not an afterthought: manifest, theme color, and standalone display are Phase 1; offline/service worker is a later dedicated phase.
6. **Phase isolation.** A phase is done only when its deliverables exist, the previous phase still works, and this spec’s acceptance criteria for that phase are met.

---

## 4. Twenty-phase roadmap

Each phase lists **intent**, **primary deliverables**, and **exit criteria**. Execute phases in order.

### Phase 1 — Repository & Environment Setup

**Intent:** Establish the monorepo, runnable API skeleton, and installable-ready frontend shell.

**Deliverables:**

- This master spec at the workspace root.
- `backend/` with `requirements.txt`, Pydantic settings, FastAPI app, CORS, `/` and `/api/v1/health`, `.env.example`.
- `frontend/` Next.js 14 App Router scaffold (React 18, TypeScript, Tailwind, Autoprefixer), PWA manifest, dark canvas, welcome screen stating Phase 1 is complete.

**Exit criteria:** Backend health endpoint returns `{"status": "healthy"}`. Frontend builds against the App Router tree and renders the Phase 1 welcome screen on `#090d16`.

**Status:** Implemented in this repository as the Phase 1 tree.

---

### Phase 2 — Backend Core Architecture & API Versioning

**Intent:** Turn the single-file app into a maintainable package: routers, schemas, exception handlers, structured logging.

**Deliverables:** `app/api/v1/` router package, shared error model, request ID middleware, OpenAPI tags, `GET {API_V1_STR}/ready` (dependency checks without calling Gemini yet).

**Exit criteria:** All v1 routes mount from a single API router. Unhandled errors return a consistent JSON envelope. OpenAPI documents the v1 surface.

---

### Phase 3 — Frontend Design System & App Shell

**Intent:** Replace the welcome placeholder with a durable shell: typography, spacing, navigation frame, and component primitives that later chat/voice screens reuse.

**Deliverables:** Tailwind theme extension for EchoMind tokens, app shell layout (header, main stage, status strip), reusable `Button` / `Panel` primitives, empty-state pattern.

**Frontend shell (implemented in `frontend/`):** mobile-first PWA chrome with bilingual EN/FA UI, RTL/LTR auto-detection in `ChatInput`, Online/Local status, intent categories (Financial, Consumer Rights, Travel, Shield), a fixed glassmorphic composer, and Web Speech API voice input (`useSpeechRecognition`, `fa-IR` / `en-GB`).

**Exit criteria:** Home and a stub `/chat` route share the shell. No one-off hex colors outside tokens except documented exceptions.

**Status:** Bilingual app shell and browser voice input are in the frontend tree (`src/app/page.tsx`, `src/app/components/ChatInput.tsx`, `src/app/hooks/useSpeechRecognition.ts`). Shared `/chat` route and token-only color lock remain for a later pass.

---

### Phase 4 — Gemini Client & Prompt Layer

**Intent:** Encapsulate Gemini behind a backend port so routes never speak the vendor SDK directly.

**Deliverables:** `app/services/gemini.py` (or equivalent), system prompt module, model name in settings, secret-safe logging (never log the API key or raw credentials), connection test used by readiness.

**Integration (this pass):** FastAPI v1 router with `POST /api/v1/chat` and `POST /api/v1/process`, placeholder pillar engine (Delay Repay, Consumer Rights, Overdraft Shield), and frontend `src/services/api.ts` calling `http://localhost:8000/api/v1`. Gemini generate remains fail-closed until a vendor client is bound.

**Exit criteria:** A backend-only smoke path can complete one Gemini generate call using `GEMINI_API_KEY`. Missing key fails closed with a clear 503.

**Status:** Gemini port, readiness, chat/process routes, and PWA API client are in the tree. Live Gemini generate is still gated.

---

### Phase 5 — Chat Completions API (non-streaming)

**Intent:** First user-visible intelligence: send a message, receive a full assistant reply.

**Deliverables:** `POST {API_V1_STR}/chat` with Pydantic request/response (`message`, optional `conversation_id`), Gemini mapping, basic content-length limits.

**Delay Repay automation (this pass):** `app/services/delay_repay.py` implements National Rail Delay Repay 15 bands (15-29 / 30-59 / 60+ / 2+ hours). `POST /api/v1/delay-repay/claims` returns an estimate and an English TOC claim draft. The PWA Travel card opens a wizard.

**Exit criteria:** curl/OpenAPI call returns an assistant message. Invalid payloads 422. Missing Gemini config 503.

**Status:** Delay Repay calculator and wizard are in the tree. Gemini-backed chat completions remain gated.

---

### Phase 6 — Streaming Chat (SSE)

**Intent:** Token streaming for perceived latency; keep the Phase 5 JSON endpoint as fallback.

**Deliverables:** `POST {API_V1_STR}/chat/stream` (SSE), frontend fetch/readable-stream consumer, cancel-on-unmount.

**Consumer Rights automation (this pass):** `app/services/consumer_rights.py` applies Consumer Rights Act 2015 goods rules (30-day reject, repair/replace, final reject, 6-month burden). `POST /api/v1/consumer-rights/notices` returns a pathway and a ready-to-send retailer notice. The PWA Consumer Rights card opens a wizard.

**Exit criteria:** Tokens appear incrementally in the client. Disconnect cancels the upstream Gemini stream.

**Status:** CRA 2015 notice engine and wizard are in the tree. SSE streaming remains a later pass.

---

### Phase 7 — Conversation Store & History

**Intent:** Conversations persist across refresh and process restart.

**Deliverables:** Persistence layer (SQLite acceptable for local; Postgres-ready abstractions), models for `Conversation` and `Message`, list/get/delete APIs under `/api/v1/conversations`.

**Exit criteria:** Creating a chat, restarting the API, and listing conversations returns the same thread with ordered messages.

---

### Phase 8 — Chat UI & Message Thread

**Intent:** Production conversation UX on top of Phases 5–7.

**Deliverables:** Thread view, composer, markdown-safe rendering, loading/error/empty states, conversation sidebar, scroll-to-latest.

**Exit criteria:** A user can start, continue, and reopen a conversation entirely from the PWA UI.

---

### Phase 9 — Auth & User Sessions

**Intent:** Bind conversations to an identity; protect mutating APIs.

**Deliverables:** Session or JWT strategy, login/logout (provider TBD: magic link or OAuth), `Authorization` on v1 chat/conversation routes, frontend session gate.

**Exit criteria:** Unauthenticated chat writes are rejected. User A cannot read User B’s threads.

---

### Phase 10 — Long-term Memory & Retrieval

**Intent:** EchoMind remembers durable facts and retrieves relevant prior context without stuffing the full history into every prompt.

**Deliverables:** Memory records, retrieval hook before Gemini calls, user-visible “what I remember” (minimal), retention policy.

**Exit criteria:** A stated preference in conversation T1 is used correctly in conversation T2 without pasting the entire T1 transcript.

---

### Phase 11 — Voice Input (Speech-to-Text)

**Intent:** Hands-free capture into the same chat pipeline.

**Deliverables:** Browser MediaRecorder (or equivalent) capture, backend STT integration (Gemini multimodal audio and/or dedicated STT), composer integration.

**Frontend note:** Browser Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition`) is already wired in `frontend/src/app/hooks/useSpeechRecognition.ts` and `ChatInput` for `fa-IR` and `en-GB`. Phase 11 still owns backend STT and turning a spoken turn into a Gemini reply.

**Exit criteria:** Spoken utterance becomes a chat user message and receives an assistant reply.

---

### Phase 12 — Voice Output (TTS) & Spoken UX

**Intent:** EchoMind can speak replies; playback is interruptible.

**Deliverables:** TTS synthesis path, audio playback in the shell, barge-in/stop, preference to default voice on/off.

**Exit criteria:** A streamed or completed assistant message can be spoken end-to-end; stop immediately silences audio.

---

### Phase 13 — Tools, Function Calling & Actions

**Intent:** Gemini may call structured tools (time, web search stub, user memory write, etc.) under server-side policy.

**Deliverables:** Tool registry, allowlist, execution sandbox (no arbitrary shell), trace of tool calls in the API response (and later UI).

**Exit criteria:** At least two tools execute in a real chat turn; unknown tools are rejected.

---

### Phase 14 — Multimodal Input (Images & Files)

**Intent:** Attach images (and later documents) to a turn.

**Deliverables:** Upload API with size/MIME limits, Gemini multimodal request assembly, chat UI attachment chip, storage or ephemeral byte handling.

**Exit criteria:** An image question returns a relevant answer; oversized/disallowed types are rejected with a clear error.

---

### Phase 15 — PWA Offline, Service Worker & Install UX

**Intent:** Make “EchoMind Assistant” reliably installable and usable for the shell/offline fallback.

**Deliverables:** Service worker, caching strategy (app shell vs network-first API), install affordance, offline banner when chat cannot reach the API.

**Exit criteria:** Lighthouse installability checks pass for the manifest + SW. Offline visit shows the shell and a truthful unavailable state for chat.

---

### Phase 16 — Settings, Persona & Preferences

**Intent:** User-controlled assistant behavior and client preferences.

**Deliverables:** Settings screen (voice, persona tone, model/temperature if exposed), persistence per user, backend enforcement of bounds.

**Exit criteria:** Preference changes survive reload and affect the next Gemini call.

---

### Phase 17 — Observability, Rate Limits & Safety

**Intent:** Operate the assistant without silent failure or abuse.

**Deliverables:** Structured request logs, latency metrics around Gemini, per-user rate limits, prompt-injection / unsafe-content handling policy, redaction of secrets in logs.

**Exit criteria:** A flooded client receives 429. Safety refusals are explicit in the API and UI. Keys never appear in logs.

---

### Phase 18 — Automated Testing

**Intent:** Lock the contracts so later phases cannot silently break v1.

**Deliverables:** Backend pytest suite (health, chat validation, authz where applicable), frontend component/route tests, a minimal e2e path (open app → health or chat smoke).

**Exit criteria:** CI-equivalent local command is documented and green on the Phase 18 tree.

---

### Phase 19 — CI/CD, Containers & Deployment

**Intent:** Repeatable build and release of both sides.

**Deliverables:** Dockerfiles for API and web (or a documented compose stack), CI on lint/test/build, environment promotion strategy (`GEMINI_API_KEY` via secrets manager, not files).

**Exit criteria:** A clean machine can deploy API + frontend from the repo with only documented env vars.

---

### Phase 20 — Production Launch, Analytics & Hardening

**Intent:** Ship a monitored 1.0 of EchoMind Assistant.

**Deliverables:** Production CORS/origin lockdown, privacy/data-retention notes, error budget / uptime check on `/api/v1/health`, product analytics (privacy-preserving), launch checklist against this spec.

**Exit criteria:** Health is green in the target environment, PWA installs, chat (stream + persist) works for a real user, and remaining gaps are logged as post-1.0 work rather than hidden.

---

## 5. Cross-cutting API conventions

- **Liveness:** `GET /` → includes `status: "online"`.
- **Readiness/health:** `GET /api/v1/health` → `{"status": "healthy"}` in Phase 1. Later phases may extend this object but must keep `status`.
- **Errors:** JSON body with `detail` (FastAPI default) until Phase 2 introduces a richer envelope; then migrate without breaking health.
- **CORS:** Enabled from Phase 1 so the Next.js origin can call the API during local development.

---

## 6. Security baseline

- `.env` is gitignored; only `.env.example` is committed.
- `GEMINI_API_KEY` is server-only.
- No wildcard CORS in production (Phase 20). Development may use a localhost allowlist.
- Uploads and tools (Phases 13–14) are allowlisted and size-capped.

---

## 7. Local development (Phase 1)

**Backend**

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # then set GEMINI_API_KEY when needed
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

Frontend default: `http://localhost:3000`  
API default: `http://localhost:8000`  
Health: `http://localhost:8000/api/v1/health`

---

## 8. Phase execution rule

When a phase is requested, implement **only that phase’s deliverables**, keep this document updated if the contract changes, and leave a user-visible or API-visible marker that the phase is complete (Phase 1: welcome copy on the home page).
