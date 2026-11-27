# Always answer + the notification contract

Mahdi's rules (2026-11-27):

1. **Always answer.** When he asks EchoMind something it must ALWAYS
   answer — never silence, never a blank empty space after his message.
   When it cannot do something because a plugin / connection / key is
   missing, it must SAY SO in his language, name exactly what is
   missing, and say what to do.
2. **Notification contract.** He is often busy / on the go — he sends a
   command and moves on. Silence is dangerous: if EchoMind says nothing,
   he assumes the task was done. So a delegated task that FINISHES must
   notify him it is done, and one that FAILS or CANNOT be done must
   notify him WITH the reason. The in-app task list must show the result
   + reason too.

Both are deterministic and need no LLM — the "I can't do this yet"
answer must work with no Gemini key.

## 1. Chat: missing-capability guidance

`backend/app/services/guidance.py`, hooked into `pillars.process_message`
(after the deterministic intent layer, before any LLM call) and into
`POST /chat/stream` (after the intent reply, before the Gemini-configured
check — the stream previously bypassed the intent layer entirely, so it
now shares it via `pillars.intent_reply`). A guidance reply is returned
instead of calling the model or returning a generic error, and renders
as a normal assistant reply (stream: meta + one delta + done; the
frontend's stream parser consumes exactly that shape).

Checks, in order:

| Message needs | Status | Reply |
|---|---|---|
| Instagram / YouTube / Bank / Drive / Docs / Sheets (matched by the Persian/English intent keywords, with `drive` needing a file word and `bank holiday` excluded) | connector not connected / not configured / Google token missing / scope not granted | names the connector + "connect it first" + where (the hub's Connect / Request access action) |
| the model (open-ended) | Gemini unconfigured | the exact 2 steps (below) |
| — | status unreadable | fail open: no guidance, existing behaviour |

- **Not signed in** is NOT handled here: the request never reaches the
  backend without a user, and the frontend keeps its honest sign-in
  error for that case only.
- A connector that IS ready does not block the message; the Gemini check
  still runs after it.

### Exact reply texts

**Instagram — not connected**
- EN: "Instagram isn't connected yet — connect it first. In the hub, tap Instagram, then press Connect and sign in. Then ask me again and I'll look."
- FA: "اینستاگرام هنوز وصل نیست — اول وصلش کن. توی هاب روی «اینستاگرام» بزن و «متصل کن» را بزن و وارد شو؛ بعد دوباره همین را بگو تا نگاه کنم."

**Instagram — not set up (no Meta app yet)**
- EN: "Instagram isn't set up yet — a Meta app has to be created first (client ID and secret), so I can't connect to Instagram until then. Once it's set up, connect it in the hub and ask me again."
- FA: "اینستاگرام هنوز راه‌اندازی نشده — اول باید یک Meta app ساخته شود (client ID و secret)؛ تا آن ساخته نشود نمی‌توانم به اینستاگرام وصل شوم. وقتی ساخته شد، توی هاب وصلش کن و دوباره بگو."

**YouTube / Drive / Docs / Sheets — Google not connected**
- EN: "Google isn't connected yet — connect it first. In the hub, tap Gmail, then press Connect and sign in with your Google account. Then ask me again."
- FA: "گوگل هنوز وصل نیست — اول وصلش کن. توی هاب روی «جیمیل» بزن و «متصل کن» را بزن و با حسابت وارد شو؛ بعد دوباره بگو."

**YouTube / Drive / Docs / Sheets — scope not granted**
- EN: "<App> isn't connected — I don't have the <App> permission yet. In the hub, tap <App>, then press Request access and approve it with your Google account. Then ask me again."
- FA: "<App> وصل نیست — دسترسی <App> را هنوز نداده‌ای. توی هاب روی «<App>» بزن و «درخواست دسترسی» را بزن و با حسابت تایید کن؛ بعد دوباره بگو."
  (App = YouTube / یوتیوب, Drive / درایو, Docs / داکس, Sheets / شیت.)

**YouTube / Drive / Docs / Sheets — Google not set up on the server**
- EN: "Google isn't set up yet on the server, so I can't connect to <App> until the Google client is configured."
- FA: "گوگل هنوز روی سرور راه‌اندازی نشده، پس تا وقتی تنظیم نشود نمی‌توانم به <App> وصل شوم."

**Bank — not connected**
- EN: "Your bank isn't connected yet — connect it first. In the hub, tap Bank, then press Connect and approve the read-only consent. Then ask me again."
- FA: "بانکت هنوز وصل نیست — اول وصلش کن. توی هاب روی «بانک» بزن و «متصل کن» را بزن و دسترسی فقط-خواندنی را تایید کن؛ بعد دوباره بگو."

**Bank — not set up (no TrueLayer account yet)**
- EN: "Banking isn't set up yet — a TrueLayer account (client ID and secret) has to be created first, so I can't connect to your bank until then."
- FA: "بانک هنوز راه‌اندازی نشده — اول باید یک حساب TrueLayer ساخته شود (client ID و secret)؛ تا آن ساخته نشود نمی‌توانم به بانکت وصل شوم."

**Gemini key missing (open-ended message)**
- EN: "I can't answer open questions yet — the Gemini key isn't set. Two steps, both free: 1. Go to aistudio.google.com/apikey, sign in with your Google account and press Create API key. 2. In Railway, open the echomind-production service, go to Variables, add GEMINI_API_KEY and press Save. The server restarts itself — then ask me again."
- FA: "هنوز نمی‌توانم به سوال‌های باز جواب بدهم — کلید Gemini گذاشته نشده. دو قدم، هر دو رایگان: ۱. به aistudio.google.com/apikey برو، با حساب گوگلت وارد شو و «Create API key» را بزن. ۲. در Railway سرویس echomind-production را باز کن، به Variables برو، GEMINI_API_KEY را اضافه کن و Save را بزن. سرور خودش ری‌استارت می‌شود — بعد دوباره بپرس."

Replies are Persian when the user writes Persian, English otherwise
(existing language detection; no new i18n system).

### Tests

`backend/tests/test_always_answer.py` (16 tests): missing Instagram
(both states), YouTube scope / Google-disconnected, Drive scope, Bank
setup, open-ended without a key (both languages), key-configured
skips guidance, configured-but-empty model falls through to the pack,
stream SSE shape (meta + delta + done) for guidance and for an intent
reply, and unauthenticated `/chat` still 401. Every guidance test
asserts no LLM call is attempted (the model function raises if called).

## 2. Notifications: delegated tasks

`backend/app/services/delegation.py` — `confirm_task` now puts the
blocking step's evidence (the reason) into `task.result` for failed /
needs-owner tasks, instead of "Nothing could be done yet." The done
path is unchanged. So the chat confirm reply ("I couldn't finish it:
<reason>"), the DelegatedWork "Result" line, and the notification all
show result + reason from the same field.

`frontend/src/services/taskNotifications.ts` — `taskNotifier.check(tasks,
lang)`, called from `DelegatedWork`'s `load()` after every poll (mount,
focus, 30 s interval). It diffs statuses against the last-seen map in
localStorage (`echomind.task-status-seen`) and fires a local
notification on the separate `echomind-tasks` channel (DEFAULT
importance, PUBLIC visibility, vibrate, no sound) for each terminal
transition it has not announced yet:

| Status | Notification |
|---|---|
| done | "انجام شد: <task>" / "Done: <task>" |
| failed | "انجام نشد، علتش: <reason>" / "Not done — reason: <reason>" |
| needs_owner | "نیاز به شما دارد: <reason>" / "Needs you: <reason>" |

- A task first seen already finished is recorded silently — opening the
  app never floods old finished tasks.
- A failed schedule keeps the old seen status, so the next poll retries
  the notice. Notification ids are stable per task and never 1 (the
  Speak notification's id).
- `DelegatedWork.handleConfirm` now reloads in `finally`, so the list
  shows the true state (result + reason) even when the confirm call
  itself failed.
- `frontend/scripts/test-task-notifications.mjs` — Node tests for the
  texts, ids, diff and check() behaviour with stub deps.

**Honest limit — local only.** These notifications fire when the app is
installed and alive / backgrounded on the phone. True server push for a
fully-closed app needs FCM + a server push sender — NOT built here.
Next step, when Mahdi wants it: a Firebase project (he supplies it),
`@capacitor/push-notifications`, and a server sender that posts to FCM
when a delegated task / watch / outcome finishes on the server.
Outcomes and watch proposals have no terminal transition polled by the
app, so they are not covered by this notifier; only delegated tasks are.

## 3. The Speak notification: lock screen + self-heal

`frontend/src/app/components/NativeShell.tsx` — `ensureVoiceNotification()`.

**What was wrong.** Mahdi's lock-screen screenshot (2026-11-27 06:43
GMT) showed no Speak notification, and the pulled-down shade (06:45
GMT) showed no card either — while the home-screen badge "1" proved an
active notification exists. Verified against the installed
`@capacitor/local-notifications` v7.0.4 sources:

- The channel importance was **already DEFAULT (3)** — the old comment
  wrongly called it Low. There is no importance left to raise; HIGH
  would add a heads-up + sound, which he did not ask for. The channel
  stays DEFAULT + PUBLIC.
- The plugin **hardcodes every notification it posts to
  VISIBILITY_PRIVATE** (`LocalNotificationManager.java`, with a TODO to
  make it controllable). No JS API can set it PUBLIC, so the lock-screen
  card shows redacted whatever the channel says. That is a plugin
  limit, not an app bug.
- The old code requested the notification permission and **ignored the
  answer**, then scheduled blindly: `schedule()` rejects when
  notifications are disabled, and the rejection was swallowed — so a
  denied permission looked exactly like a posted notification.
- The notification is posted once at app start and never re-checked:
  after a force-stop, or a permission granted later, it stays gone
  until the app opens again. (After a reboot the plugin's restore
  receiver does re-post it — `schedule()` saves every notification to
  storage — but that covers reboot only.)

**The fix (this change).**

- **Permission gate:** check → request if prompt → proceed only when
  granted; if denied, stop silently (only the owner can allow it:
  Settings → Apps → EchoMind → Notifications).
- **Self-heal:** on every app open AND on resume from background,
  `getDeliveredNotifications()` checks whether the ongoing Speak
  notification (id 1) is actually posted; it is re-posted only when
  missing. Re-scheduling the same id replaces the visible one and,
  with `onlyAlertOnce` (set by the plugin), does not re-ping — and
  skipping the post when it is already there is cheaper and provably
  silent.
- **Badge:** the "1" IS this notification (one active notification).
  It is left alone — Mahdi has not answered the badge question yet.
  No badge behaviour was changed.

**Phone-side checks, if the card still does not show** (not code):
- Look at the **single-swipe notification shade** (swipe down once
  from the top-left), not the double-swiped quick-settings panel —
  on One UI 7 the two are separate panels.
- Settings → Lock screen → Notifications → ON; "Hide content" OFF
  if he wants the Speak text visible (PRIVATE notifications are
  redacted while it is on).
- Settings → Apps → EchoMind → Notifications → allowed.

**Not verified headless — phone test items.** Lock-screen visibility,
shade visibility, the self-heal after a force-stop / reboot, and the
permission-denied path cannot be verified in this environment (no
Android device; CI builds the APK but cannot see a lock screen).
Phone test: install the new APK, confirm the Speak card is in the
shade and on the lock screen; force-stop the app, reopen it, confirm
the card returns; deny notifications once and confirm nothing is
posted and no error shows.

## 4. What is still NOT covered

- Live provider calls still need their keys (GPT / Claude / Cursor,
  TrueLayer, Meta app, Google Cloud API enables) — guidance names the
  missing piece, it does not conjure the connection.
- A transient Gemini failure (key set, call fails) still falls back to
  the generic pack reply; only the unconfigured case gets the key
  guidance.
- A task stuck in "running" (server died mid-confirm) cannot be
  re-confirmed — `confirm_task` refuses `running` tasks, and re-running
  could duplicate side effects. Recorded, not fixed here.
- Server push for a fully-closed app (FCM) — see §2.
- Voice input itself: see `docs/voice-stt.md` — the mic now has a
  native path on the phone (Web Speech does not exist in WebView).
