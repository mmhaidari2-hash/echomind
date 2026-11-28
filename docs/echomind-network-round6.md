# EchoMind network — round 6: use the phone's own internet

Date: 2026-11-27. Status: **staged on branch `doodombeh/echomind-next`,
NOT pushed**. Waiting for Mahdi's «بفرست».

## The request

Mahdi, 2026-11-27 22:21 GMT (dictated, Turkish/Persian mix):

> «این کاری کن که از خود گوشی اینترنت خود گوشی وای فای اینا استفاده کنه»

Background: the app shows "couldn't connect" while his phone's other
apps work fine on the same Wi-Fi. The phone's own internet must be
used, and the app must say the truth about what is wrong: phone
offline vs server down are different problems.

## Findings (verified in code, not assumed)

- `DEFAULT_BASE = "/api/v1"` in `frontend/src/services/api.ts`.
- Old `candidateBases()` in production returned
  `[sameOriginBase(), configured (NEXT_PUBLIC_API_URL = Railway),
  ...lanHostBases()]`.
- `isNativeShell()` verdict: **it was always false on the phone.**
  It checked `window.location.protocol === "capacitor:"` or
  `"ionic:"`, but `capacitor.config.json` sets
  `server.androidScheme "https"` + `server.hostname "localhost"`,
  so the phone build's origin is `https://localhost` and the
  protocol check never fired. The phone build therefore probed the
  same-origin base (itself — `https://localhost`, i.e. the phone,
  not a server) first, and fell back to it whenever Railway was
  briefly unreachable. Every such fallback failed as a fake
  "offline".
- Old `resolveApiBase()` probed each candidate with
  `HEALTH_TIMEOUT_MS = 2500ms` in order, and if all failed it fell
  back to `candidateBases()[0]` — the dead same-origin base.
- `@capacitor/network` is **not installed** (package.json has
  @capacitor/android/app/browser/camera/core/local-notifications/
  splash-screen/status-bar, no network).
- No network-state check existed anywhere in `frontend/src`:
  no `navigator.onLine`, no network plugin.
- `answerForError` mapped **every** `network_error` (and every
  `TypeError`) to `answerOffline` ("You're offline right now…") —
  so a dead localhost probe, a down Railway, or a DNS failure all
  read as "phone offline". That was the misdiagnosis behind
  "couldn't connect while Wi-Fi works".
- The offline banner was driven only by the server ping
  (`pingHealth`, 30s interval): whenever the server ping failed the
  banner showed, conflating phone-offline with server-down.

## What changed per file

### NEW `frontend/src/services/network.ts`
- `isPhoneOnline()` — `navigator.onLine`, fail-open `true` when
  there is no navigator (tests / SSR). Fail-open is deliberate:
  when the browser cannot tell us, we try the call and let the
  real error speak.
- `onPhoneNetworkChange(listener)` — subscribes to the window
  `online`/`offline` events, returns an unsubscribe, no-op
  outside a browser.
- No new native plugin. `@capacitor/network` was **not** installed
  on purpose: it reads the same Android `ConnectivityManager` that
  `navigator.onLine` already reflects in the WebView, so it adds a
  dependency + `cap sync` step for no new information. If a future
  need arises (e.g. distinguishing Wi-Fi from mobile data, or
  metered connections), that is the point to add it.

### `frontend/src/services/api.ts`
- Native detection replaced: the protocol check is gone.
  `loadIsNativePlatform()` lazily imports `@capacitor/core` and
  calls `Capacitor.isNativePlatform()` — the real check (native
  bridge / custom platform). Same lazy-import pattern as
  `photos.ts`, so the module stays importable in plain Node tests;
  a failed import means "web". `resetApiBase()` also resets the
  detection cache.
- `candidateBases()` is now async. **Native + production returns
  exactly `[configured]`** — the Railway URL only. No
  same-origin base, no `127.0.0.1`, no `10.0.2.2`, no LAN host.
  This is the AGENTS.md rule: production Android builds must not
  depend on `127.0.0.1`/localhost/LAN fallbacks. Native + dev
  keeps the emulator hosts (`10.0.2.2`, the emulator's host
  loopback) for USB/emulator work. The web build is unchanged.
- `request()`: phone-offline gate before the fetch — throws
  `ApiError` code `"phone_offline"`.
- `resolveApiBase()`: phone-offline gate **before** the cached-base
  return and before any probe — throws `phone_offline`, attempts
  nothing. Empty candidate list throws `"no_api_configured"` and
  never falls back to localhost. A probe that fails because the
  phone went offline mid-probe rethrows `phone_offline` instead of
  falling through to a dead base.
- `streamChat()`: same gate before its raw fetch (it does not use
  the `request()` helper, so it needed its own).
- `isRetryable` unchanged: `phone_offline` and
  `no_api_configured` are not retryable — only `network_error` /
  `timeout` are.

### `frontend/src/app/lib/copy.ts`
- `answerOffline` renamed to `answerPhoneOffline` (EN + FA) with
  the required wording:
  - EN: "Your phone has no internet — turn on Wi-Fi or mobile
    data. Your message is saved on this device — try again when
    you're back online."
  - FA: «اینترنت گوشی وصل نیست — وای‌فای یا دیتا را روشن کن.
    پیام‌تان روی همین دستگاه ذخیره شد — وقتی آنلاین شدید دوباره
    تلاش کنید.»

### `frontend/src/app/page.tsx`
- `answerForError`: `phone_offline` → `answerPhoneOffline`;
  `network_error` → `answerFailed` (was `answerOffline`);
  `TypeError` → phone-aware (`isPhoneOnline() ? answerFailed :
  answerPhoneOffline`). The old comment ("a network error means
  the device is offline") was wrong and is fixed.
- New `phoneOffline` state, initialised from `isPhoneOnline()`
  and kept live via `onPhoneNetworkChange`. The offline banner
  now shows only when `phoneOffline` is true. The green/gold dot
  is unchanged — it is server health, not phone connectivity.

### NEW `frontend/scripts/test-network.mjs`
Node tests in the `test-speech.mjs` pattern (tsc-compile
`network.ts` to a temp dir, stub navigator/window): no navigator
→ online (fail open); `onLine` true/false; events reach the
listener; unsubscribe stops calls; no window → no-op. 5 cases.

## The gap the probe caught (and the fix)

The first probe run passed 18/20. The two failures were real:

1. `resolveApiBase()` returned the **cached** base before checking
   `isPhoneOnline()`. A phone that goes offline after the base was
   resolved handed the cached base to `streamChat`'s raw fetch,
   which has no second gate — so the app initiated a doomed
   streaming fetch while offline (blocked at the network layer, so
   nothing left the device, and the visible reply was still the
   correct phone-offline message — but an attempt was made).
   Fixed by moving the offline check before the cached-base
   return, and by adding the same gate to `streamChat` before its
   fetch.
2. Two probe-counting bugs (not product bugs): CORS preflight
   OPTIONS requests were counted as API attempts (each cross-origin
   POST is preceded by one), and the mount health ping happened
   before the case-A measurement window. The probe now excludes
   OPTIONS and checks health over the whole session log.

## Verification (overlay `~/workspace/echomind/.verify-round6/`)

- `npx tsc --noEmit`: **0 errors** (before and after the fix).
- `node scripts/test-speech.mjs`: pass.
- `node scripts/test-network.mjs`: **5/5 cases pass**.
- `npm run export:android` with
  `NEXT_PUBLIC_API_URL=http://127.0.0.1:18080/api/v1`:
  **exit 0**. Note: the export needs the same step CI uses —
  `rm -rf frontend/src/app/api` first. That route
  (`/api/v1/travel/intent`) is server-only, carries
  `export const dynamic = "force-dynamic"`, and cannot be
  statically exported; the CI workflow
  (`.github/workflows/android-apk.yml`) removes it before the
  export. The first overlay build failed on it until the CI step
  was replicated — the route is on main and on the branch, and is
  NOT part of round 6.
- Headless probe `probe-round6.mjs` (chrome-headless-shell, CDP,
  412px, native simulated the official Capacitor way via
  `window.CapacitorCustomPlatform = { name: "android" }` injected
  before any page script; mock API on 127.0.0.1:18080 standing in
  for Railway): **20/20 checks pass.**
  - Native detection engaged: `Capacitor.isNativePlatform() ===
    true` in the page.
  - Case A (mock up, phone online): server-busy reply
    («سرور الان شلوغ است…»), API requests only to the configured
    base (`/api/v1/chat/stream`, `/api/v1/chat`), zero requests
    to `https://localhost`, `10.0.2.2`, or `127.0.0.1:800x`.
  - Case B (mock down, phone online): server-unreachable reply
    («الان نتوانستم به سرور وصل شوم…»), NOT the offline message;
    offline banner NOT shown; attempts only to the configured
    (dead) base.
  - Case C (mock up, phone offline via CDP
    `Network.emulateNetworkConditions offline:true`):
    `navigator.onLine === false`, offline banner shown,
    phone-offline reply («اینترنت گوشی وصل نیست — وای‌فای یا دیتا
    را روشن کن…»), **zero** API requests attempted, mock saw
    zero requests.
  - Built output: grep of `out/_next/static/chunks/` finds **no**
    `10.0.2.2` and **no** `127.0.0.1:800x` string anywhere — Next
    inlines `NODE_ENV=production` at build time and eliminates
    the dead dev branches, so the native production bundle cannot
    even name a localhost base. Only the configured base is baked
    in. The behavioural proof is the CDP network log above.

## Probe cost bound (task c)

Moot in the native production build: there is exactly one
candidate (the configured URL), so there is no probe chain to
stall on. The single health probe still has the 2500ms
`HEALTH_TIMEOUT_MS` bound. The web build keeps its dev
candidates and the same 2500ms-per-candidate bound.

## Honest limits — what only the phone can prove

- **The phone test is the gate.** Headless Chrome with a
  simulated native platform proves the logic and the request
  behaviour, not the Samsung WebView: `navigator.onLine` on the
  real phone, the real Railway URL over real Wi-Fi/mobile data,
  and the real Capacitor runtime.
- The mock stands in for Railway. The live Railway backend is
  still stale (verified 2026-11-27: `/chat/stream` and
  `/providers` missing live) and there is still **no Gemini key**,
  so even with the network fix the chat answer on the phone will
  be the honest server-busy / server-old message, not a live
  answer — until PR #2 is merged, Railway redeploys, and the
  Gemini key is set. The network fix changes *which truthful
  message* shows; it does not make the server answer.
- `navigator.onLine` reports the OS connectivity state; it can
  say "online" on a captive portal or a Wi-Fi network with no
  route to the internet. In that case the user gets the
  server-unreachable message, which is still truthful.
- The offline banner shows the phone-offline state; the green/gold
  dot still shows server health. Both can disagree (gold dot +
  offline banner = server unreachable *and* phone offline is
  impossible in practice — gold means the last ping failed, which
  happens when the phone is offline too; the banner is the
  authoritative phone signal).
- `@capacitor/network` was deliberately not added (see above).
  If Mahdi later wants "Wi-Fi vs mobile data" distinction, that
  is the plugin to add.
- The round-5 orbit-node fix is still unproven on his phone
  (headless only); round 6 does not change it.
