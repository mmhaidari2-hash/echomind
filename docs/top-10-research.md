# Top-10 research — personal AI assistants and the repos they stand on

Researched 2026-11-26 (web search + GitHub search API). Models, not
things to copy: EchoMind's job is to be different, not a cheaper clone.

## Commercial assistants — what each does best

| # | Model | Best at | EchoMind's answer |
|---|-------|---------|-------------------|
| 1 | **ChatGPT** (+ "dots", always-on agent) | General reasoning, huge model, always-on agent mode | EchoMind does not compete on reasoning. It competes on *outcomes*: the Outcome Loop finishes things instead of answering about them. |
| 2 | **Claude** (+ Cowork desktop agent, 1M context, computer use, scheduled tasks) | Long-horizon desktop work, computer use, scheduled tasks | Cowork acts on your computer. EchoMind acts on your *life*: obligations, promises, deadlines — with evidence and confirmation, not screen control. |
| 3 | **Gemini** (+ Spark always-on; deep Gmail/Calendar/Workspace; Personal context on by default) | Deepest Gmail/Calendar integration, personal context | Gemini reads your mail to answer questions. EchoMind reads your mail to *detect obligations before you remember them* (Inbox Watch) and to *verify* outcomes afterwards. Same mailbox, different job. |
| 4 | **Vellum** | Persistent memory + personal knowledge base + proactive reach-outs, own identity, real-world actions | Vellum is the closest model for proactive memory. EchoMind's Life Graph is the same idea made *evidenced*: every node carries its source message, and every action needs authority. |
| 5 | **Perplexity Computer** | Research, multi-model orchestration | Research is not the job. The job is the claim, the case, the refund — the outcome after the research. |
| 6 | **OpenClaw** (self-hosted, always-on, persistent memory) | Self-hosted always-on agent | OpenClaw proves an agent can live on your machine. EchoMind proves an agent can live in your *obligations* — and be trusted with them. |
| 7 | **Littlebird** | Memory from the active window + meeting transcripts, scheduled Routines | Littlebird watches what you do. EchoMind watches what *companies owe you* — a narrower, more valuable memory. |
| 8 | **Rewind / Limitless** | Continuous screen/meeting capture memory | Capture-everything memory is powerful and intrusive. EchoMind is the opposite: it stores only what matters (obligations, promises, evidence) and says so. |
| 9 | **Slashy** | AI-native email/calendar | Email-native is the right instinct. EchoMind adds the Life Graph on top of the inbox: the email is the evidence, not the product. |
| 10 | **Manus / Zo Computer** | Personal cloud computer | A cloud computer does tasks. EchoMind finishes obligations — and proves it did. |

## GitHub repos (>1000 stars) drawn from

### Agent / assistant frameworks — techniques taken
- **openclaw/openclaw** — 395,269★ — "The AI that really does things. Any OS. Any Platform." Model for an always-on agent with persistent memory and real actions. Taken: the *always-on, act-don't-chat* posture; the authority-envelope idea is EchoMind's own answer to it.
- **mem0ai/mem0** — 69,501★ — "The Memory Layer for AI Agents." Model for memory as a layer, not a feature. Taken: memory as structured, queryable records — EchoMind's Life Graph is that layer, owner-scoped and evidenced.
- **zhayujie/CowAgent** — 48,090★ — desktop agent patterns. Taken: scheduled, proactive work (Morning Brief, Promise Chaser cadence) as first-class behaviour, not a chatbot add-on.
- **khoj-ai/khoj** — 38,262★ — "Your AI second brain", scheduled automations. Taken: automation as scheduled routines over your own data.
- **agentscope-ai/QwenPaw** — 38,226★ — agent framework patterns.
- **zeroclaw-labs/zeroclaw** — 33,632★ — self-hosted always-on patterns.
- **leon-ai/leon** — 17,726★ — open-source personal assistant; modular skill structure. Taken: the idea that capabilities are small, named modules (each EchoMind idea is one module + one endpoint + one test file).
- **elie222/inbox-zero** — 13,126★ — "The world's best AI personal assistant for email." Model for inbox triage done well. Taken: the inbox as a source of *obligations*, not just messages to answer — Inbox Watch is EchoMind's version.
- **MemoriLabs/Memori** — 17,617★ — persistent memory patterns.
- **memvid/memvid** — 17,440★ — video memory / retrieval patterns.
- **EverMind-AI/EverOS** — 14,011★ — always-on assistant OS patterns.

### UI — glassmorphism / 3D / waterfall — techniques taken
- **shadcn-ui/ui** — 129,145★ — composable, accessible components; copy-paste, own the code. Taken: the *distribution model* — `Glass.tsx` is a small copy-paste component set owned by the repo, not a dependency.
- **pmndrs/react-three-fiber** — 33,959★ — React renderer for Three.js. Model for real 3D in React. NOT added as a dependency: the current 3D is CSS perspective/preserve-3d (orb, tilt, depth layers), which is honest 3D at a fraction of the bundle cost for a Capacitor app. react-three-fiber is the named path if a true 3D globe is wanted later.
- **magicuidesign/magicui** — 23,584★ — animated components and effects, copy-paste. Taken: staggered entrance and gradient accents as *technique*, reimplemented in CSS (`--reveal-delay`, `echomind-gradient-text`).
- **pmndrs/drei** — 10,203★ — helpers for react-three-fiber. Noted for the same future 3D path.
- **ibelick/motion-primitives** — 7,042★ — animated interfaces kit. Taken: spring-like easing (`cubic-bezier(0.22, 1, 0.36, 1)`) and reveal-on-scroll as the motion language.
- **naughtyduk/liquidGL** — 1,106★ — Liquid Glass for the Web (WebGPU/WebGL). Taken: the liquid-glass recipe — backdrop blur + saturate + inner highlight + layered translucency — reimplemented in pure CSS so it works in the Capacitor WebView without WebGPU.
- Waterfall/masonry: no single >1000★ masonry repo fit the stack, so the waterfall is native CSS multi-column masonry (`columns`, `break-inside: avoid`) plus IntersectionObserver cascade reveal — the standard dependency-free technique, and the one that survives in a mobile WebView.

### Testing / security patterns
- **fastapi/full-stack-fastapi-template** — 46,341★ — FastAPI + React full-stack template. Taken as the shape to keep: backend/frontend split, owner-scoped records, server-side security boundaries, no secrets in the client.
- Existing repo patterns kept: conftest tmp stores + `require_user` override (no new test dependencies), idempotency keys on every authority proposal, fail-closed on missing connectors, audit trail on every confirmed action.

## Licenses
All techniques above were taken as *patterns* (reimplemented in our own
code), not copied code. Where a package was considered and not added
(react-three-fiber, framer-motion), the reason is recorded: bundle size
for the Capacitor app and no justification for a heavy dependency when
CSS delivers the same surface. No license obligations arise from
pattern-level reuse.
