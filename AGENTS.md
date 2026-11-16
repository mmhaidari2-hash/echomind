# EchoMind Agent Rules

## Mission
Build EchoMind as an Android-first personal AI assistant for the UK market. The mission is not complete when one phase, APK, screen, or API works. It is complete only when the approved product acceptance criteria are met end-to-end.

## Source of truth
Read, in this order, before changing code:
1. AGENTS.md
2. MASTER_BOOK.md
3. ECHOMIND_MASTER_SPEC.md
4. ANDROID.md
5. DEPLOY.md
6. current Git HEAD and existing uncommitted/newer work

Preserve newer compatible work. Do not delete or rewrite an earlier rule or contract on conflict without explicit owner approval; record the conflict instead.

## Product contract
EchoMind is not a chatbot wrapper. It is a personal mobile assistant that:
- knows the signed-in user and isolates every user's data;
- keeps durable memory, preferences, obligations, promises, watches, cases, documents, and conversation history;
- accepts text, voice, images and files;
- plans and performs bounded actions through allowlisted tools;
- asks for confirmation before consequential actions;
- follows up and verifies outcomes;
- supports Gmail and Calendar first, then travel/bookings, consumer rights, finance/Open Banking and payments only behind explicit authority and legal/safety gates;
- is English-first for the UK market; Persian is allowed for owner testing/input;
- is Android-first and must work on a physical Android device without localhost dependencies.

## Execution rules
- Keep the existing monorepo split: backend/ and frontend/. Do not introduce a new top-level application without owner approval.
- Prefer additive changes over rewrites.
- Security boundaries are server-side. Never trust localStorage, client-provided user IDs, query parameters or spoofable headers for identity.
- Secrets stay server-side and must never be logged or embedded in APK/web bundles.
- Mutating personal-data APIs require verified identity.
- Every persisted record must be owner-scoped.
- High-impact actions require explicit confirmation, bounded scope, idempotency and an audit trail.
- Fail closed on missing auth, missing credentials, invalid evidence or uncertain action state.
- Public health/readiness endpoints may remain unauthenticated.
- Android production builds must use HTTPS backends and must not depend on 127.0.0.1/localhost/LAN fallbacks.
- Do not claim a phase complete without executable verification.

## Differentiation checkpoint
Before merging a phase or moving to the next major capability, answer:
"Why can EchoMind deliver this outcome better than a large incumbent with more money and staff?"
The answer must point to a concrete product/technical advantage, not marketing language. Current approved differentiators:
1. Personal Life Graph: one user-owned graph across memory, cases, obligations, promises and evidence.
2. Obligation Engine: detects deadlines, rights, renewals, refunds and commitments before the user remembers them.
3. Promise Tracker: records what people/companies promised, attaches evidence and follows up.
4. Outcome Loop: plan -> confirm -> act -> verify -> follow up, rather than answer-only chat.
5. Bounded Authority: every external action has an explicit authority envelope and evidence trail.
6. UK-first outcome engines: consumer rights, Delay Repay, travel and financial-friction workflows grounded in UK context.

## Acceptance gates
A capability is complete only when:
- backend contract and authorization are tested;
- frontend/mobile path is tested;
- failure state is truthful and visible;
- data survives restart when persistence is required;
- user A cannot read/write user B data;
- Android build succeeds in CI;
- no secret is present in the built client.
