# EchoMind Master Book v2 — Android-first Personal Assistant

**Status:** Approved product direction and current top-level source of truth.
**Market:** United Kingdom, English-first.
**Primary device:** Android physical device.
**Architecture:** Preserve the existing `backend/` FastAPI + `frontend/` Next.js/Capacitor monorepo.

This document extends and supersedes conflicting product-scope statements in `ECHOMIND_MASTER_SPEC.md`. Where there is no conflict, the 20-phase engineering contracts in that specification remain valid.

## 1. Product definition

EchoMind is a personal outcome assistant, not a generic chatbot. It must remember the user, understand current context, maintain obligations and evidence, take bounded actions with explicit authority, verify outcomes and continue follow-up.

The finished product must combine these capabilities in one mobile experience:

- verified sign-in and per-user isolation;
- durable conversation history and long-term memory;
- Personal Life Graph linking people, organisations, places, accounts, cases, documents, obligations, promises and outcomes;
- Obligation Engine for deadlines, refunds, renewals, rights, payments and commitments;
- Promise Tracker with evidence and follow-up;
- text + streaming replies;
- voice input and interruptible voice output;
- image/document ingestion with bounded MIME/size handling;
- tool/action registry with server-side allowlist, authority envelope, confirmation and audit trail;
- Gmail and Calendar connectors;
- UK consumer-rights, Delay Repay, overdraft/fee, travel and booking outcome flows;
- proactive watches and notifications;
- later finance/Open Banking read access and payment initiation only after the required legal, provider and confirmation gates;
- Android production packaging, signed release path and Play-ready hardening.

## 2. Language and market

The product UI and external communications default to UK English. Persian is a testing/input language for the owner and may be supported as a user-selected language, but language must not infer jurisdiction, home location, currency or legal regime.

Store separately:
- UI language
- command/input language
- external communication language
- home/operating market
- jurisdiction
- currency
- travel destination

## 3. Trust model

Identity comes only from a verified authentication token. The backend derives the owner ID from the verified token subject. Client body/query/localStorage values never establish identity.

Every personal record is owner-scoped. Consequential actions use:
- explicit proposed action;
- authority scope;
- required evidence;
- confirmation;
- idempotency key;
- execution record;
- verification result;
- follow-up state.

## 4. Core data domains

The durable model must cover:
- users/preferences
- conversations/messages
- memory facts
- context tags
- documents/evidence
- watches/alerts
- obligations
- promises
- cases
- tool/action executions
- external connector accounts
- audit events

Storage may evolve, but APIs must stay behind repository/service boundaries so file/SQLite storage can move to Postgres without rewriting product logic.

## 5. Execution order

Dependency order:
1. AUTH-01 — verified identity + per-user isolation
2. MEMORY-01 — durable owner-scoped memory/profile
3. CONVERSATION-01 — durable threads/messages
4. CORE-01 — independent language/market/jurisdiction/currency context
5. STREAM-01 — streaming assistant transport
6. LLM-01 — real production Gemini generation + prompt/memory retrieval
7. VOICE-01 — STT + TTS + interruption
8. FILES-01 — images/documents/evidence
9. AUTHORITY-01 — bounded authority + confirmation + audit
10. TOOLS-01 — allowlisted tool registry
11. LIFEGRAPH-01 — personal graph
12. OBLIGATION-01 — obligations/deadlines
13. PROMISE-01 — promise/evidence/follow-up
14. GMAIL-01
15. CALENDAR-01
16. OUTCOME-01 — background follow-up and verification
17. TRAVEL-01
18. FINANCE-READ-01
19. PAYMENTS-01
20. TRUST-01 — safety/rate limits/observability/redaction
21. ANDROID-RELEASE-01 — signed release, Play readiness, physical-device QA
22. BILLING-01 / launch packaging

A later capability may be scaffolded early, but it may not bypass an earlier security or identity dependency.

## 6. Android acceptance

A build is not considered a usable EchoMind release merely because Gradle succeeds. The Android acceptance gate requires:
- app installs on a physical Android device;
- no localhost dependency;
- authenticated session works;
- protected API request succeeds;
- data remains isolated and persists;
- chat works end-to-end;
- offline/failure states are truthful;
- no client secret is embedded;
- release build path is documented and reproducible.

## 7. Current gap

The repository already contains useful UK workflow engines, document parsing, watches, a memory prototype, travel approval UI and an Android Capacitor wrapper. These are foundations, not completion. The current highest-priority gap is AUTH-01 and owner-scoped persistence. Until that is live-verified, no personal-data feature may be called production-ready.
