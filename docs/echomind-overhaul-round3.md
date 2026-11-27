# EchoMind overhaul — round 3 (home screen, voice, chat, lock screen)

Branch: `doodombeh/echomind-next`. Status: **staged only — NOT pushed, NO CI, NO merge** (Mahdi: «هیچی نفرست فعلا»).

## What Mahdi reported (new build a236918d, confirmed installed)

His 7 screenshots (07:55–07:56 GMT 2026-11-27) + the target mockup
(`~/workspace/user/files/18112_24_qs19.jpg`, iPhone render) + three
functional bugs. The round-2 hub fixes did NOT hold on the device,
so the screenshots are treated as the current state.

## 1. The 100dvh layout — dead black gap, black scroll state

**Root causes found**

- The hero was a plain column: title, CommandBrief, hub, delegation,
  engines — with no first-viewport block. The orb sat wherever the
  column put it, half-clipped behind the composer, with a black void
  above it.
- The black intermediate scroll state was the reveal system:
  `DelegatedWork` wrapped its heading and empty state in `<Reveal>`
  (CSS `.echomind-reveal` starts at opacity 0 until an
  IntersectionObserver fires), and `MotionReveal` started at
  opacity 0 with `whileInView`. A fast scroll — or an observer that
  never fired inside the nested scroller — showed a black void with
  a half-clipped gold "Delegate" pill instead of content.

**Fix**

- The hero is now a deterministic first screen: `min-h-[calc(
  var(--app-height,100dvh)-13rem)]`, content centred — subtitle +
  golden orb, never pushed down, never half-clipped. The wordmark
  moved into the header (see below), so the hero has no redundant
  big title.
- Cards cascade below the orb (mockup order): Suggested next step
  (CommandBrief) → Delegation → engines (ActionRail waterfall).
- Nothing in the app may gate visibility on scroll position any
  more: `.echomind-reveal` and `.echomind-cascade-item` start
  VISIBLE; `Cascade`'s hidden state is opacity 1 + 8px rise;
  `MotionReveal` is a plain wrapper; the two `<Reveal>`s in
  `DelegatedWork` are gone.
- Scroll choreography without invisible states: the waterfall
  offsets stay, the orbit tick ring now turns WITH the user's scroll
  (up to 120° as the hub scrolls through the viewport, rAF-throttled),
  and the orb keeps its breathing/listening/thinking/executing
  states.

## 2. Header — the mockup top bar

Top bar now matches the mockup: "EchoMind" wordmark + "AI ASSISTANT"
badge left; online dot + EN/فا pills right; Context pill + Auth
status on a second row. One row cannot fit all six controls at
360px without clipping, so it is two rows on a phone. No sample
text or numbers from the mockup were hardcoded — everything binds
to real state.

## 3. Truncation, overflow, safe areas

- **Composer placeholder ("Message Ech"):** the textarea was
  `flex-1` without `min-w-0`, so it would not shrink below its
  intrinsic width and the placeholder truncated. Added `min-w-0`;
  the three buttons are 40px on a phone (44px on sm+), so the full
  "Message EchoMind…" fits at 360px.
- **Active Connections row:** was a horizontally scrolling flex
  row — the 4th tile sat half off the right edge. Now a responsive
  `grid-cols-4` (2 rows × 4, all 8 apps visible), tiles are raised
  beveled medallions; the "N apps synced" pill header wraps
  instead of colliding.
- **Live Workspace cards:** metric number + label are now a
  `flex-col gap-1` stack with explicit line-heights
  (`leading-none` / `leading-[1.3]`), so "Active" can never overlap
  "Deadlines" again.
- **Text wrapping:** `min-w-0` + `overflow-wrap: break-word` on
  the Model providers, Delegation, hub, drawer and Dashboard
  cards, names, powers and metric labels.
- **Safe areas:** the main scroller now has
  `pb-[calc(env(safe-area-inset-bottom,24px)+88px)]` above the
  floating composer. The Local Context sheet ALSO lifts its whole
  bottom edge 48px above the viewport
  (`bottom-[max(env(safe-area-inset-bottom,0px),48px)]`): on an
  Android WebView `env(safe-area-inset-bottom)` is 0 and Samsung's
  3-button bar is ~48px, so a `bottom-0` sheet sits behind the bar
  — that is why BALANCE GUARD was cut off even though the inner
  scroll area already had 80px of padding. Lifting the sheet makes
  the cut impossible by construction; the inner 80px stays too.

## 4. Beveled glassmorphism + embossed 3D icons

- New `.echomind-glass-bevel`: `linear-gradient(165deg,
  rgba(36,33,28,0.72), rgba(14,13,12,0.86))`,
  `backdrop-filter: blur(20px) saturate(160%)`, specular top/left
  highlight, dark bottom/right edge, inner top rim glow, deep soft
  shadow. `GlassCard` (and its `strong` variant, deeper shadow)
  now renders it — so every card surface (hub, ActionRail,
  DelegatedWork, CommandBrief, wizards) is beveled at once.
  The drawer sections (ConnectionsHub, ProvidersPanel, HubStatus)
  use it directly; the composer dock uses it too.
- New `.echomind-medallion` / `.echomind-medallion-gold`: raised
  glass-metal discs (radial surface gradient, specular inner rim,
  warm amber glow) for the 8 orbit nodes, the 8 connection tiles,
  the composer mic, and the gold send button. No transform on
  `:active` (the orbit nodes are positioned with translate-50%;
  a transform would make them jump) — brightness only.
- The orb itself keeps its volumetric radial lighting; it is now a
  real button (see §6) with focus ring + press brightness.

## 5. Graceful auth & connection states

The red raw strings are gone from the signed-out path:

- New `SignInPrompt` (Glass.tsx): a calm prompt + a direct
  "Sign in" button — but the button only renders when sign-in is
  actually configured (Clerk key in the build). Without the key it
  says plainly that sign-in arrives with the next app update,
  instead of offering a dead button.
- ConnectionsHub / ProvidersPanel / HubStatus / DelegatedWork:
  a 401 / no-session failure shows the calm prompt;
  a 404 (older server) shows the calm "arrives with the next app
  update" note; any other genuine failure shows a compact
  "Try again" button that re-runs the load.
- New `isAuthError()` helper in `services/api.ts`; `loadHubStatuses`
  now also returns `unauthenticated`.

## 6. The golden button — BOTH microphones

**Diagnosis.** The orb was never a button at all: `LivingOrb` is an
`aria-hidden` div with no click handler — the big golden "talk"
button did nothing. The composer mic did call the native path, but
with three silent-failure modes:

1. `useSpeechRecognition.start()` awaits the plugin's `start()`,
   which can hang forever (recognizer service slow/unavailable)
   without resolving or calling back — `listening` stayed false,
   `error` stayed null, and the mic looked dead with no feedback.
2. While sending (`disabled={sending}`) the mic button was
   disabled — and a reply that never arrives kept it disabled.
3. When the recognizer is unavailable the button gave no hint
   until tapped.

**Fix**

- The orb is now a real `<button>` (focus ring, press feedback).
  Tapping it dispatches the same `echomind-listen-request` the
  composer mic, widget and Speak action use; tapping again while
  listening dispatches the new `echomind-listen-stop-request`.
  A one-line teacher sits under the orb ("Tap the orb to talk" /
  "Listening… tap the orb to stop").
- The hook gained a `starting` state (immediate "Listening…"
  feedback on tap) and an 8s watchdog: a native start that never
  resolves and never calls back now fails visibly with "Voice
  input failed. Try again." instead of hanging silently.
- The mic button is no longer disabled while sending; a persistent
  muted hint appears when the availability probe has finished and
  there is no recognizer at all.
- Both paths use the native recognizer (fa-IR) on Android, never
  Web Speech; every failure surfaces on screen via the existing
  notice (denied / no speech / network / unsupported).
- The Connect buttons in both hubs now use Capacitor `Browser.open`
  instead of `window.open` — opening OAuth in the WebView itself
  would navigate the app away.

**Still not verifiable headlessly:** whether the native recognizer
actually starts on Mahdi's Samsung (RECORD_AUDIO permission state,
fa-IR support on the device, Google recognizer availability). The
phone test is the gate — if it fails there, the on-screen notice
will now say exactly why.

## 7. Chat still gives no answer

**Diagnosis — three stacked causes.**

1. **Live Railway serves the OLD build (0.1.0):** `/chat/stream`
   404s and `/providers` 404s there. The client only fell back
   from stream to `POST /chat` on a 503, so a 404 re-threw to a raw
   "Request failed (404)" error article.
2. **No sign-in in the build:** the APK shows "Auth setup" — the
   Clerk publishable key is not in the build (the CI workflow
   injects it from the repo secret, so the secret is presumably
   unset). Every protected call then threw `AuthSessionError`
   ("Please sign in…") before any network request, so the app
   could never reach the server at all.
3. **404 retry masking:** `withBase` treated 404 as retryable, so
   a 404 from Railway was retried against the next candidate base
   (localhost in the app) and the user finally saw "Could not
   reach EchoMind" — the true cause was hidden.

**Fix (app side — the server side still needs the redeploy + key)**

- `streamChat` now falls back to `sendChat` on ANY stream failure
  (404/503/timeout/offline), not just 503.
- New `auth: "optional"` mode: chat calls send the session when
  there is one and call without it when there is not. The live
  server answers `/chat` without a token; the new server answers
  401, which the UI turns into the honest sign-in message. (The
  old backend's anonymous reply carries no personal data; the
  authed path is used whenever a session exists.)
- 404 removed from `isRetryable`: a 404 on a known endpoint is the
  older server, not a wrong base — retrying localhost only masked
  it. Base discovery is unaffected (`resolveApiBase` catches the
  health probe itself).
- `streamChat` gained a 20s first-byte timeout (the 60s overall
  timer stays): a server that accepts the connection but never
  answers no longer leaves a stuck "thinking" bubble.
- **Always-answer:** `answerForError()` maps every failure to a
  visible assistant reply in the user's language naming the cause
  (sign-in / older server / offline / timeout / busy / failed).
  All three chat paths (stream, Gmail cleanup, travel quote) post
  it as a normal assistant message — never a red error article,
  never silence.

**Still needed (not this branch):** the Railway redeploy of main
(so `/chat/stream` + `/providers` exist live), the Gemini key, and
the Clerk publishable key as a repo secret (so sign-in exists in
the APK at all). Until then the app answers from the live `/chat`
endpoint, which is the honest best it can do.

## 8. Lock screen — the Speak notification

**Diagnosis.** Two stacked causes: (a) the Capacitor plugin
hardcodes every posted notification to VISIBILITY_PRIVATE, so the
card could only ever show redacted — and Mahdi's lock screen
showed nothing at all, which points at (b) the notification not
being posted: the old code requested the permission and ignored
the answer, then scheduled blindly; a denied permission looked
exactly like a posted notification.

**Fix.** The notification is now posted from native code:
`SpeakNotification.java` (framework `android.app.Notification`
only, no new dependency), called from `MainActivity.onResume`.
It sets VISIBILITY_PUBLIC on the notification itself (and PUBLIC
on the channel), so the full "EchoMind — Tap Speak to talk"
card shows on the lock screen. Same id (1) and channel
(`echomind-voice`) as before: the badge "1" is unchanged and an
old PRIVATE card is replaced, not duplicated. Tapping the card
(or its Speak action) fires the same deep link as the widget
(`echomind://assistant?listen=1`). The JS side keeps only the
POST_NOTIFICATIONS permission gate (check + request once when
"prompt"); the plugin scheduling, action listener and resume
self-heal are removed — the native post on every resume is the
self-heal now.

**Honest limit:** even a PUBLIC notification is hidden when the
phone itself disables lock-screen notifications (Settings →
Lock screen → Notifications) or hides notification content. If
the card still shows nothing after this build, that phone
setting is the remaining cause. Task-result notifications
(done/failed) still go through the plugin, so they stay
VISIBILITY_PRIVATE (redacted on the lock screen) — the in-app
task list still shows the result + reason.

## 9. The white vertical pill (screenshots 18106_19, 18100_21)

**OS, not app code.** Evidence: the identical pill (⋯ grip at
top, ♫ music icon at bottom, semi-transparent white, fixed to
the screen's right edge) appears in two different app views at
the same screen position; the app has no music-note icon
anywhere; it is absent in the other five screenshots. It is the
Samsung One UI Edge panel handle. Nothing in the app draws it,
so there is nothing to fix in code. (Our own scrollbars are now
hidden on the app scroller, so no in-app scrollbar can be
mistaken for it.)

## Files changed (staging only)

- `frontend/src/app/lib/copy.ts` — always-answer replies,
  sign-in prompts, retry, orb labels.
- `frontend/src/services/api.ts` — `isAuthError()`, optional
  auth for chat, 404 no longer retryable, stream first-byte
  timeout.
- `frontend/src/app/components/hubApps.ts` — `loadHubStatuses`
  returns `unauthenticated`.
- `frontend/src/app/hooks/useSpeechRecognition.ts` — `starting`,
  `probed`, 8s start watchdog.
- `frontend/src/app/components/Glass.tsx` — beveled `GlassCard`,
  safe `Cascade`/`MotionReveal`, `SignInPrompt`.
- `frontend/src/app/globals.css` — `.echomind-glass-bevel`,
  `.echomind-glass-bevel-strong`, `.echomind-medallion`,
  `.echomind-medallion-gold`, visible-by-default reveals,
  hidden app scrollbars.
- `frontend/src/app/components/HomeHub.tsx` — orb is a listen
  button, medallion nodes, scroll-linked ring rotation,
  `Browser.open` for Connect, listening hint.
- `frontend/src/app/components/ChatInput.tsx` — `min-w-0`
  composer, smaller buttons, mic freed from `disabled`,
  starting/unavailable feedback, stop-request listener, beveled
  dock, gold medallion send.
- `frontend/src/app/components/ConnectionsHub.tsx` — 4-column
  grid, wrapped header, flex-col metrics, graceful auth states,
  `Browser.open`.
- `frontend/src/app/components/ProvidersPanel.tsx` — graceful
  auth/outdated/retry states, bevel, overflow guards.
- `frontend/src/app/components/HubStatus.tsx` — same.
- `frontend/src/app/components/DelegatedWork.tsx` — Reveals
  removed, graceful auth state, overflow guards.
- `frontend/src/app/components/Dashboard.tsx` — overflow guards.
- `frontend/src/app/components/ContextDrawer.tsx` — sheet lifts
  48px above the nav bar, overflow guards.
- `frontend/src/app/page.tsx` — mockup header (wordmark + AI
  ASSISTANT badge), 100dvh hero with the orb, cards cascade,
  main safe-area padding, always-answer + stream fallback.
- `frontend/src/app/components/NativeShell.tsx` — permission gate
  only; the Speak notification moved to native code;
  `LISTEN_STOP_REQUEST` exported.
- `frontend/android/app/src/main/java/com/echomind/assistant/SpeakNotification.java`
  — NEW: native PUBLIC Speak notification.
- `frontend/android/app/src/main/java/com/echomind/assistant/MainActivity.java`
  — NEW in staging (main's is `extends BridgeActivity {}`):
  `onResume` ensures the Speak notification.

## Verification

- `tsc --noEmit`: **pass, 0 errors** (in a main + staging
  overlay; a corrupt `node_modules` from the earlier session was
  replaced with a fresh `npm ci`, 215 packages, next 14.2.35).
- `npm run export:android`: see the build result in the parent
  report (same step CI runs).
- Backend tests: no backend file changed; suite re-run in the
  existing full-tree overlay (see parent report).
- Headless probe at 360×800 and 411×914: see parent report.
- Gradle compile of the new Java: a full `./gradlew
  assembleDebug` cannot run in this VM — the egress proxy
  resets Java TLS connections to Maven repos (curl reaches
  dl.google.com and repo.maven.apache.org fine; Java gets
  "Connection reset"), and AGP 8.7.2 is not in the local cache
  (only 8.5.2 from the launcher build). Targeted check instead:
  `javac -encoding UTF-8` of all three app Java files against
  android.jar API 35 (with a stub R class and a stub
  BridgeActivity, since the real Capacitor AAR is not cached):
  **exit 0** — MainActivity, MicWidgetProvider and
  SpeakNotification all compile. One deprecation note only (the
  pre-O `Notification.Builder` fallback branch — intentional).
  The full build is CI's job when this is pushed; CI #133
  already proved the pipeline for the prior staging state, and
  these two files are the only new native code since then.
- `npx cap sync android` in the overlay: **pass** — found 7
  plugins including @capacitor-community/speech-recognition
  7.0.1, browser, camera. Note: the checked-in
  `capacitor.settings.gradle` is stale (5 plugins, no
  speech/camera/browser) — CI regenerates it via `cap sync`
  before the Gradle build, so the plugins register there.

## Thread-paint fix (headless-shell finding, 2026-11-27 ~08:45 GMT)

After the first probe, the after-send screenshot still showed a
black void where the chat thread should be — even though the DOM
was provably correct (scrollTop at max, articles at the right
rects, opacity 1, `elementFromPoint` returning the bubble itself,
text readable via `innerText`). Bisected in the headless shell
(Playwright headless shell 1255, software rasterizer):

- A plain injected `<div>` with inline styles painted in the
  thread region; the React-rendered articles did not.
- A clone of the user bubble, and a fresh div carrying the
  article's exact classes, also did not paint.
- Giving the user bubble `position: relative` made it paint
  immediately; the assistant reply (still unpositioned) stayed
  black in the same screenshot.

Diagnosis: the shell's software rasterizer does not paint
non-positioned content in that scroll region — a shell limit,
the same one round 2 recorded ("headless screenshots still show
empty main after send (software-raster limit)"). On a real phone
the WebView uses GPU compositing and paints normally. But
`position: relative` on the three thread-message roots is a
zero-risk, layout-neutral change (no offsets; it only creates a
positioning context), and it makes the thread paint in every
renderer, so it was applied:

- `frontend/src/app/page.tsx` — user bubble `<article>`:
  `relative` added to its class list.
- `frontend/src/app/components/AssistantReply.tsx` — both
  `<article>` roots (pending + normal): `relative` added.
- `frontend/src/app/components/TravelApprovalCard.tsx` —
  `<article>` root: `relative` added.

After the fix the offline chat probe paints the whole thread
(user bubble + assistant reply card, "I couldn't reach the
server just now…") — the always-answer path is now visually
verified headless. Re-verified after this change: `tsc`
0 errors, `export:android` exit 0, backend 260 passed.

## What remains unverified (the phone is the gate)

- The native recognizer actually starting on Mahdi's Samsung
  (permission, fa-IR, Google recognizer).
- The native Speak notification appearing on the lock screen.
- The orb tap starting listening on the device.
- The hero/scroll fixes holding on the real WebView (headless
  Chrome previously failed to reproduce real-phone scroll bugs).
- Railway still serves 0.1.0 and the Clerk key is still unset —
  those two are outside this branch and decide whether chat can
  ever be more than the live `/chat` fallback.
