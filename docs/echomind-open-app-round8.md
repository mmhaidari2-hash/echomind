# EchoMind round 8 — open-app voice action

## Why this round exists

Mahdi said "open the Instagram app" (23:45 GMT, 27 Nov 2026) and EchoMind did
nothing. That was not a bug in the mic or the chat — the capability did not
exist at all: no app-launch action, no "open X" intent anywhere in the app.
This round adds it: speak or type "open Instagram" (or
«اینستا رو باز کن») and the app opens Instagram on the phone and says so.

## Design

### Route chosen: `@capacitor/app-launcher` (route (a))

The maintained Capacitor way. `AppLauncher.canOpenUrl` / `openUrl` are thin
wrappers over an Android intent: `canOpenUrl` tries `getPackageInfo` for a
package name, then `ACTION_VIEW` resolution for a scheme; `openUrl` tries
`ACTION_VIEW`, then `getLaunchIntentForPackage(url)`, then a plain
`new Intent(url)`. Verified from the plugin's own source (v7.0.4) and docs.

Why not the custom-Java route (b): the plugin already does exactly the
intent work route (b) would duplicate, it is maintained against new
Android versions, and — decisively — the CI workflow already runs the sync
step the plugin needs. `.github/workflows/android-apk.yml` runs
`npx cap sync android` before `./gradlew assembleDebug`, and `cap sync`
registers the plugin in `capacitor.settings.gradle`
(`include ':capacitor-app-launcher'`, pointing at
`../node_modules/@capacitor/app-launcher/android`), so its native code
lands in the APK. Verified in the round-8 overlay: `cap sync` found
8 plugins including `@capacitor/app-launcher@7.0.4`, and
`capacitor.plugins.json` lists it.

Android 11+ package visibility: `canOpenUrl("com.instagram.android")`
returns false unless the package is declared. The plugin's docs confirm
targets must be in `AndroidManifest.xml` inside `<queries>` — added
(see the map below). Without this, every check would say "not installed"
even for apps that are installed.

### Scheme / package map (`openAppCommand.ts` → `OPEN_APP_TARGETS`)

| App | Package | Scheme |
| --- | --- | --- |
| Instagram | `com.instagram.android` | `instagram://` |
| YouTube | `com.google.android.youtube` | `vnd.youtube://` |
| Gmail | `com.google.android.gm` | `googlegmail://` |
| Drive | `com.google.android.apps.docs` | — |
| Docs | `com.google.android.apps.docs.editors.docs` | — |
| Sheets | `com.google.android.apps.docs.editors.sheets` | — |
| Calendar | `com.google.android.calendar` | — |
| Bank | unmapped — no package/scheme | — |

The launcher tries the package first, then the scheme. There are deliberately
**no `https://` fallbacks**: a web link would open the browser when the app
is missing and look like a success while doing the wrong thing. An
uninstalled app must fail truthfully ("not installed").

Bank is unmapped on purpose: there is no single bank app — the user's bank
app package is unknown. The parser still recognises "open bank" and the
reply says so truthfully instead of pretending.

### Deterministic local command parser (`openAppCommand.ts`)

Pure function, no imports, no backend. The live backend is stale and has
no Gemini key, so the command is matched on the phone, before any network
call — the same precedent as the Gmail cleanup local command in `handleSend`.

Rules:

- Whole-message match only, after trim / lowercase / Persian normalisation
  (Arabic ي/ك → Persian ی/ک, tatweel and diacritics stripped, ZWNJ kept).
- Leading «لطفا» / "please" and trailing punctuation are stripped.
- English: `open|launch [the] <name> [app]`, `go to <name>`.
- Persian: `<name> رو|را باز کن`, `باز کن <name>`, `<name> باز کن`,
  optional leading «اپ».
- Names are matched EXACTLY (longest first, so "google drive" beats
  "drive"). No substring matching — "open the drive to the airport" and
  "open the claim for my train" must stay chat messages. The only
  substring exception is bank, which has no package anyway.
- An open-shaped message naming an unknown app of ≤ 2 words returns
  `{ kind: "unknown", name }` so the reply can say "I don't know an app
  called X". Longer text returns `null` and falls through to chat.

Recognised names (EN / FA): instagram / اینستاگرام، اینستا؛ youtube /
یوتیوب؛ gmail / جیمیل؛ drive / درایو؛ docs / داکس؛ sheets / شیت؛
calendar / تقویم، کالندر؛ bank / بانک.

### Launcher service (`appLauncher.ts`)

Same injectable pattern as `photos.ts`: `createAppLauncher(deps)` takes
`isNative`, `canOpenUrl`, `openUrl`; `getAppLauncher()` lazily dynamic-imports
`@capacitor/app-launcher` once and caches it. Results:

- `ok` — the app opened.
- `not-installed` — neither package nor scheme resolves.
- `unmapped` — bank (no target configured); the plugin is never called.
- `unavailable` — not a native shell (plain web); the plugin is never
  called.
- `error` — the plugin threw, or the installed app would not launch
  (`completed: false`).

Every failure is caught; `handleSend` always shows a visible reply.

### Wiring (`page.tsx` `handleSend`)

The parser check sits right after the Gmail cleanup block, before the
travel intent block. Both the voice auto-send path (`ChatInput.tsx`
`handleVoiceSessionEnd` → `onSend` → `handleSend`) and the typed submit
funnel into the same `handleSend`, so one check covers both. On a match it
appends the user bubble and a pending assistant bubble, runs the launch,
then replaces the pending bubble with the result text — exactly the
always-answer shape (opened / not installed / don't know / unavailable /
error). On no match the message flows to chat unchanged.

Confirmation is the command itself: the user said "open Instagram", so no
separate confirm step — opening an app is reversible and user-initiated,
the same standing as the Gmail cleanup local command. (AGENTS.md asks for
confirmation before high-impact actions; launching an app the user named
is not one — no data changes, no money moves, no message sent.)

### Copy (`copy.ts`)

Six new strings, EN + FA, all with a `{app}` placeholder:
`openAppOpened` (««اینستاگرام» رو باز می‌کنم…»),
`openAppNotInstalled` (««{app}» روی گوشی نصب نیست.»),
`openAppUnmapped` (bank: «برای بانک هنوز اپ مشخصی ندارم — اسم بانک رو بگو؟»),
`openAppUnknown` («اپی به اسم «{app}» نمی‌شناسم. …»),
`openAppError` («نتونستم «{app}» رو باز کنم. دوباره امتحان کن.»),
`openAppUnavailable` («اپ‌ها رو فقط از برنامهٔ گوشی می‌تونم باز کنم، نه از مرورگر.»).

### Backend

No backend changes. Checked `backend/app/services/persian.py` and
`services/intent.py` first: they contain only `normalize_fa`,
`detect_language`, `parse_relative_date`, `parse_money_gbp` — no open-app
patterns to stay consistent with. The client-side parser is new.

## Files changed

| File | Change |
| --- | --- |
| `frontend/package.json` / `package-lock.json` | `@capacitor/app-launcher@7.0.4` added |
| `frontend/src/app/lib/openAppCommand.ts` | NEW — package/scheme map + deterministic FA/EN parser |
| `frontend/src/services/appLauncher.ts` | NEW — injectable launcher service, 5 outcomes |
| `frontend/src/app/lib/copy.ts` | 6 new `openApp*` strings, EN + FA |
| `frontend/src/app/page.tsx` | `handleSend`: parser check after the Gmail cleanup block (lines ~599–637); imports for the parser + `getAppLauncher` |
| `frontend/android/app/src/main/AndroidManifest.xml` | `<queries>`: the 7 packages + 3 intent queries (schemes) |
| `frontend/scripts/test-open-app.mjs` | NEW — 45 Node cases (see below) |
| `docs/echomind-open-app-round8.md` | this doc |

## Verification (overlay `~/workspace/echomind/.verify-round8/`)

Built from the round-7 overlay (rsync `--link-dest`; `cp -al` fails on
ownership here) + staging rsync + `@capacitor/app-launcher` copied into
the overlay `node_modules`.

- `npx tsc --noEmit` — **0 errors**.
- `node scripts/test-speech.mjs` — pass. `test-network.mjs` — 5/5 pass.
- `node scripts/test-open-app.mjs` — **45/45 pass**: parser for all 8
  apps EN + FA, "please"/«لطفا», "open the X app", "go to X", unknown
  apps, and 8 must-not-match messages; service: not-native →
  unavailable, bank → unmapped, installed → opened with the right
  package, not installed → not-installed with `openUrl` never called,
  installed-but-won't-launch → error, plugin throws → error, package
  missing but scheme works → opened via scheme.
- `export:android` (with `NEXT_PUBLIC_API_URL=http://127.0.0.1:18080/api/v1`,
  CI's `rm -rf src/app/api` step — a no-op here, the dir does not exist
  in this tree) — **exit 0**.
- `npx cap sync android` — **exit 0**, 8 plugins found including
  `@capacitor/app-launcher@7.0.4`; `capacitor.plugins.json` lists it;
  `capacitor.settings.gradle` includes `:capacitor-app-launcher`;
  built chunks contain `AppLauncher` (3 chunks); the manifest
  `<queries>` survived the sync (7/7 packages, 3/3 schemes).
- Headless probe `probe-round8.mjs` — **26/26 checks pass** at 412px
  (fa locale, mock API: health 200, `/chat/stream` 404, `/chat` 503):
  - Typed "open Instagram" → launcher called with
    `com.instagram.android`, user bubble exact, reply
    ««اینستاگرام» رو باز می‌کنم…».
  - Voice «اینستا رو باز کن» → interim «اینستا» in the draft while
    holding, release → auto-sent as the exact final text → launcher
    called with `com.instagram.android`, same confirmation.
  - Typed "open Foo" → «اپی به اسم «foo» نمی‌شناسم…», nothing launched.
  - Plain web (no native shell) → «اپ‌ها رو فقط از برنامهٔ گوشی
    می‌تونم باز کنم…», nothing launched.
  - Screenshots viewed: `probe8/shot-412-open-instagram.png`,
    `probe8/shot-412-voice-open.png` — both show the user bubble and
    the «باز می‌کنم…» confirmation.

Two probe findings worth knowing (both probe-only, neither is an app bug):

1. **The voice half cannot run native headless.** The speech plugin's
   WEB implementation throws `unimplemented` for `start()`, so with the
   native shell simulated the hook's native speech path can never start
   here — on a real phone the Android implementation exists. The hook
   reads `isNativeApp()` live at `start()` time, so the probe flips
   `Capacitor.isNativePlatform()` to false just for the orb hold (web
   path runs, the fake SpeechRecognition delivers the transcript) and
   back to true the moment the orb is released — 700 ms before the
   harvest fires `handleSend` — so the launch half still runs native.
   The app code is untouched by this; it is a probe seam only.
2. **The first probe run failed 6 checks for a probe bug, not an app
   bug:** the waiter's "pending" regex included the `…` character, and
   the confirmation itself ends with `…` («باز می‌کنم…»), so the waiter
   never matched it — while the launch itself had already happened
   (`opened=["com.instagram.android"]`). Fixed by dropping `…` from
   the pending test (the reply-fragment requirement already guards
   against matching a pending bubble).
3. **Thread restore works:** the voice-case screenshot shows the
   typed case's pair above the voice pair — the `loadApp` fresh-thread
   seeding does not fully clear, because the app re-persists the
   restored thread on load. Harmless for the probe (checks match the
   last pair); on the phone a restored thread is the designed durable
   memory.

## Honest limits — what only the phone can prove

- **Whether the plugin actually launches the app on Samsung WebView.**
  Headless, the plugin's web implementation stands in for the native
  one: `canOpenUrl` always returns true and `openUrl` calls
  `window.open`. The probe proves the app calls the plugin with the
  right package and shows the right confirmation. It cannot prove the
  Android intent resolves on Mahdi's phone — that is the phone test's
  job (say "open Instagram", watch Instagram open).
- **Whether the native speech path delivers the transcript on his
  phone.** The voice chain is proven headless on the web path (round 7)
  and the launch chain on the native path (this round); the two halves
  meet in `handleSend`, one code path. But the native recognizer on
  Samsung is the part that has failed before (rounds 3–4) — if the
  transcript never arrives, nothing launches, and the reply will be the
  "no speech" notice, not a launch.
- **The bank app's package is unknown.** "Open bank" is recognised and
  answers truthfully that no bank app is configured. Mahdi's bank app
  package still needs to be supplied (or a per-user setting built) before
  it can open.
- **An uninstalled app fails truthfully** — by design ("not installed"),
  and the `<queries>` list is what makes the check accurate on Android
  11+. If a target app is installed but the package name differs by
  region/variant, the check will say "not installed" wrongly.
- **No backend, no Gemini key, no PR #2 merge is involved.** This round
  does not fix the typed-message-no-answer problem for ordinary chat
  (that still needs the merge + key); it only makes "open X" commands
  work locally.
