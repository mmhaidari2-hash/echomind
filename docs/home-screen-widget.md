# Home-screen mic widget + persistent voice notification

Mahdi's requirement: on a train, bus or ship, hands busy, he cannot
type — he must be able to talk to EchoMind from anywhere without
hunting for the app on his phone. Two one-tap paths, both firing the
same deep link (`echomind://assistant?listen=1`) and the same voice
start as the mic button in the chat dock.

## 1. Home-screen widget

**Add it:** long-press the home screen → **Widgets** → **EchoMind** →
drag **EchoMind Mic** (2×2) onto the home screen.

**What it is:** the golden orb (the app's round launcher icon) with a
white mic glyph on a dark disc. One tap opens EchoMind and starts
voice input in Persian (fa-IR) — or English, following the app's
language toggle.

**How it works**

- `frontend/android/app/src/main/java/com/echomind/assistant/MicWidgetProvider.java`
  — `AppWidgetProvider`, Java (the app module has no Kotlin plugin).
  `onUpdate` builds the `RemoteViews` and wires the whole widget to
  a `PendingIntent` for `echomind://assistant?listen=1`.
- `frontend/android/app/src/main/res/layout/widget_mic.xml` — orb
  (`@mipmap/ic_launcher_round`) + scrim + mic glyph.
- `frontend/android/app/src/main/res/xml/echomind_mic_widget_info.xml`
  — 2×2 cell (`minWidth`/`minHeight` 110dp), `resizeMode="none"`,
  `widgetCategory="home_screen"`, no periodic updates.
- `frontend/android/app/src/main/res/drawable/ic_mic.xml`,
  `widget_mic_scrim.xml` — mic glyph and the dark disc behind it.
- `frontend/android/app/src/main/AndroidManifest.xml` — registers the
  receiver and adds an intent-filter for `echomind://assistant`,
  copying the existing `echomind://oauth` pattern. MainActivity is
  `singleTask`, so a tap while the app is open brings it forward
  instead of opening a second copy.
- `frontend/android/app/src/main/res/values/strings.xml` — the
  `widget_mic_label` string.

All files live under `frontend/android/` and are committed, so the
widget survives `npx cap sync android` (sync only copies the web
bundle, it never regenerates native resources).

## 2. Persistent notification

**What it is:** a permanent EchoMind notification with a **Speak**
action — visible in the notification shade and on the lock screen.
One tap on **Speak** opens the app and starts voice input. It is
silent (low-importance channel: no sound, no vibration, no
heads-up) and ongoing, so it cannot be swiped away; it stays until
the app is uninstalled. Tapping the notification body itself just
opens the app — **Speak** is the talk path.

**How it works** — no new dependency, no foreground service. It uses
the `@capacitor/local-notifications` plugin already in the app
(`frontend/src/app/components/NativeShell.tsx`):

- On every native boot it creates the channel `echomind-voice`
  (importance low, visibility public) — re-creating an existing
  channel is a no-op on Android — registers the action type
  `echomind-speak` (one action, id `speak`), and schedules the
  notification with fixed id `1`, so re-scheduling replaces it
  instead of stacking duplicates. The plugin restores scheduled
  notifications after a reboot.
- The action title and body follow the app's stored language
  (`echomind.locale`): Persian «صحبت کن» when the app is in Persian,
  otherwise "Speak".
- Tapping Speak fires `localNotificationActionPerformed`; the
  listener calls the same `requestListen()` as the deep link. The
  plugin retains the event until the JS listener registers, so it
  also works when the app was fully closed.
- If notification permission is denied, the calls fail silently and
  nothing is shown — the widget still works.

## 3. The shared listen flow (web side)

- `NativeShell.tsx` extends the existing `appUrlOpen` listener
  (previously OAuth-only) to `echomind://assistant?listen=1`, and
  reads the cold-start launch URL via `App.getLaunchUrl()`.
  `requestListen()` writes a sessionStorage flag
  (`echomind-listen-request`, timestamped) and dispatches a window
  event of the same name.
- `ChatInput.tsx` consumes the flag on mount (cold start) and
  listens for the event (warm start), and also honours a plain
  `?listen=1` URL parameter (consumed once, then stripped from the
  address bar). All three funnel into the same `startListening()`
  as the mic button — including the existing error notice if the
  mic is denied or speech recognition is unsupported. The flag
  expires after 60 seconds, so a stale request never starts the
  mic on a later visit.

## If it does not work

- **Widget missing from the picker:** install the APK from the
  `doodombeh/echomind-next` branch (the widget is native — the web
  build alone does not have it), then try again. After an app
  update the widget stays where it is.
- **Notification not showing:** allow notifications for EchoMind
  (Android 13+: Settings → Apps → EchoMind → Notifications). It
  appears after the first launch of the new version.
- **Tap opens the app but no listening:** allow the microphone
  (the app asks on first voice use); the chat shows an honest
  error if it is denied. The Web Speech recogniser needs network
  for fa-IR on most devices.
- **Nothing happens on tap:** the deep link needs the new build;
  older installs do not know `echomind://assistant`.

## What CI still has to prove

The frontend typecheck + build were verified locally. The native
side (Java provider, widget XML, manifest wiring) was validated by
inspection only — the Gradle gate is CI (`android-apk` on the
branch), which must compile the widget and package the APK before
this is called done.
