"use client";

import { useEffect } from "react";

import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { LocalNotifications } from "@capacitor/local-notifications";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

import { isNativeApp } from "../lib/native";

/** Window event + sessionStorage flag that ask the chat composer to
    start listening. Both carry the same request: the event covers a
    warm start (app already open), the flag covers a cold start (the
    composer mounts after this shell runs, and consumes the flag). */
export const LISTEN_REQUEST = "echomind-listen-request";

/** Window event that asks the chat composer to stop listening (the
    golden orb, tapped again while listening). */
export const LISTEN_STOP_REQUEST = "echomind-listen-stop-request";

/** Ask the app to start voice input, through both channels. */
function requestListen() {
  try {
    window.sessionStorage.setItem(LISTEN_REQUEST, String(Date.now()));
  } catch {
    /* Private mode — the window event below still carries it. */
  }
  window.dispatchEvent(new Event(LISTEN_REQUEST));
}

/** Handle one deep link opened by the system (widget tap,
    notification action, or any other caller). */
async function handleOpenUrl(url: string) {
  if (url.startsWith("echomind://oauth/google")) {
    await Browser.close().catch(() => undefined);
    window.dispatchEvent(new Event("echomind-google-connected"));
    return;
  }
  if (url.startsWith("echomind://assistant")) {
    try {
      const parsed = new URL(url);
      if (parsed.searchParams.get("listen") === "1") requestListen();
    } catch {
      /* Malformed deep link — the app is already open, nothing to do. */
    }
  }
}

/** Persistent voice notification — who owns it (round 3).
 *
 * The notification itself is posted from native code now
 * (SpeakNotification.java, called from MainActivity.onResume), NOT
 * from this file's LocalNotifications plugin. Reason, verified
 * against the installed plugin (v7.0.4): the plugin hardcodes every
 * notification it posts to VISIBILITY_PRIVATE, so the card shows on
 * the lock screen redacted at best — and on Mahdi's phone it showed
 * nothing at all. No JS API can set it PUBLIC; that is a plugin
 * limit, not an app bug. The native post sets VISIBILITY_PUBLIC on
 * the notification itself (and PUBLIC on the channel), so the full
 * "EchoMind — Tap Speak to talk" card shows on the lock screen.
 * Same id (1) and channel (echomind-voice) as before, so the
 * home-screen badge "1" is unchanged and an old PRIVATE card is
 * replaced, not duplicated. The Java post runs on every resume, so
 * it self-heals after a reboot, a force-stop, or a permission
 * granted later in Settings.
 *
 * What stays in JS: the POST_NOTIFICATIONS permission gate. On
 * Android 13+ the runtime permission decides whether anything can
 * be posted at all — the native post is silently dropped without
 * it, and only the owner can allow it (Settings → Apps → EchoMind
 * → Notifications). The old code requested it and ignored the
 * answer, then scheduled blindly; the rejection was swallowed, so
 * a denied permission looked exactly like a posted notification.
 * This gate requests once when the answer is still "prompt" and
 * stops there when denied.
 *
 * Lock-screen truth: even a PUBLIC notification is hidden when the
 * phone itself disables lock-screen notifications (Settings →
 * Lock screen → Notifications) or when a lock-screen mode hides
 * notification content. If the card still shows nothing after this
 * build, that phone setting is the remaining cause. */
async function ensureSpeakPermission() {
  let permission = await LocalNotifications.checkPermissions().catch(
    () => undefined,
  );
  if (permission?.display === "prompt") {
    permission = await LocalNotifications.requestPermissions().catch(
      () => undefined,
    );
  }
  // Granted or denied: the native side posts (or drops) the card.
  // Nothing more JS can do here — and nothing to re-check on resume,
  // MainActivity handles that natively.
}

export default function NativeShell() {
  useEffect(() => {
    if (!isNativeApp()) {
      return;
    }

    let removeUrlListener: (() => Promise<void>) | undefined;

    const boot = async () => {
      await StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
      await StatusBar.setBackgroundColor({ color: "#090A0F" }).catch(() => undefined);

      const urlHandle = await App.addListener("appUrlOpen", async ({ url }) => {
        await handleOpenUrl(url);
      });
      removeUrlListener = () => urlHandle.remove();

      // Cold start from the widget / notification: the launch URL is
      // delivered here because the listener above only fires for
      // links opened while the app is already running.
      const launch = await App.getLaunchUrl().catch(() => undefined);
      if (launch?.url) await handleOpenUrl(launch.url);

      // Permission gate only — the persistent Speak notification
      // itself is posted natively (SpeakNotification.java); the
      // LocalNotifications plugin can only post it PRIVATE.
      await ensureSpeakPermission();

      await SplashScreen.hide().catch(() => undefined);
    };

    void boot();

    return () => {
      void removeUrlListener?.();
    };
  }, []);

  return null;
}
