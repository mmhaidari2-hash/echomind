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

/** Fixed id of the persistent voice notification, so re-scheduling
    on every boot replaces it instead of stacking duplicates. */
const VOICE_NOTIFICATION_ID = 1;

/** Channel of the persistent voice notification. */
const VOICE_CHANNEL_ID = "echomind-voice";

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

/** True when the ongoing Speak notification is currently posted. */
async function isVoiceNotificationPosted(): Promise<boolean> {
  try {
    const delivered = await LocalNotifications.getDeliveredNotifications();
    return delivered.notifications.some(
      (item) => item.id === VOICE_NOTIFICATION_ID,
    );
  } catch {
    return false;
  }
}

/** Persistent voice notification: an ongoing EchoMind notification
    with a Speak action, so Mahdi can talk hands-free (train, bus,
    ship) without opening the app first. Built on the
    LocalNotifications plugin already in the app — no new dependency,
    no foreground service. `ongoing: true` means it cannot be swiped
    away; tapping Speak launches the app and the retained action event
    starts listening.
 *
 * Lock-screen truth, verified against the installed plugin (v7.0.4):
 * - the channel importance here is 3, which IS Android DEFAULT (the
 *   old comment wrongly called it Low). DEFAULT + PUBLIC visibility is
 *   already the level that shows on the lock screen — there is no
 *   importance left to raise, and HIGH would add a heads-up + sound.
 * - the plugin hardcodes every notification it posts to
 *   VISIBILITY_PRIVATE (LocalNotificationManager.java), so the card
 *   shows on the lock screen redacted, whatever the channel says.
 *   No JS API can set it PUBLIC; that is a plugin limit, not an app
 *   bug. If nothing shows on the lock screen at all, the phone-side
 *   setting is the cause (Settings → Lock screen → Notifications).
 * - the badge "1" on the home-screen icon IS this notification (one
 *   active notification). It is left alone until Mahdi answers the
 *   badge question.
 *
 * Self-heal: on every app open (and on resume from background) this
 * checks whether the notification is actually posted and re-posts it
 * only when missing — after a reboot the plugin's restore receiver
 * re-posts it, but a force-stop, a permission granted later, or a
 * dismissal leaves it gone until the app opens again. Re-scheduling
 * the same id replaces the visible one and, with onlyAlertOnce (set
 * by the plugin), does not re-ping; skipping the post when it is
 * already there is cheaper and provably silent. */
async function ensureVoiceNotification() {
  // Permission gate: on Android 13+ the POST_NOTIFICATIONS runtime
  // permission decides whether anything can be posted at all. The old
  // code requested it and ignored the answer, then scheduled blindly —
  // schedule() rejects when notifications are disabled, and the
  // rejection was swallowed, so a denied permission looked exactly
  // like a posted notification. If it is denied, stop: only the owner
  // can allow it (Settings → Apps → EchoMind → Notifications).
  let permission = await LocalNotifications.checkPermissions().catch(
    () => undefined,
  );
  if (permission?.display === "prompt") {
    permission = await LocalNotifications.requestPermissions().catch(
      () => undefined,
    );
  }
  if (permission?.display !== "granted") return;

  if (await isVoiceNotificationPosted()) return;

  const fa = (() => {
    try {
      return window.localStorage.getItem("echomind.locale") === "fa";
    } catch {
      return false;
    }
  })();
  const speak = fa ? "صحبت کن" : "Speak";
  const body = fa
    ? "برای صحبت با اکومایند، «صحبت کن» را بزنید"
    : "Tap Speak to talk to EchoMind";

  await LocalNotifications.createChannel({
    id: VOICE_CHANNEL_ID,
    name: "EchoMind voice",
    description: fa
      ? "میانبر صوتی همیشگی اکومایند"
      : "EchoMind always-on voice shortcut",
    // DEFAULT (3): visible in the shade and on the lock screen, no
    // heads-up. No sound file is set, so the channel stays silent.
    importance: 3,
    // PUBLIC at channel level; the plugin still forces the posted
    // notification itself to PRIVATE (see the note above).
    visibility: 1,
  }).catch(() => undefined);

  await LocalNotifications.registerActionTypes({
    types: [{ id: "echomind-speak", actions: [{ id: "speak", title: speak }] }],
  }).catch(() => undefined);

  await LocalNotifications.schedule({
    notifications: [
      {
        id: VOICE_NOTIFICATION_ID,
        title: "EchoMind",
        body,
        channelId: VOICE_CHANNEL_ID,
        ongoing: true,
        autoCancel: false,
        actionTypeId: "echomind-speak",
      },
    ],
  }).catch(() => undefined);
}

export default function NativeShell() {
  useEffect(() => {
    if (!isNativeApp()) {
      return;
    }

    let removeUrlListener: (() => Promise<void>) | undefined;
    let removeActionListener: (() => Promise<void>) | undefined;
    let removeResumeListener: (() => Promise<void>) | undefined;

    const boot = async () => {
      await StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
      await StatusBar.setBackgroundColor({ color: "#090A0F" }).catch(() => undefined);

      const urlHandle = await App.addListener("appUrlOpen", async ({ url }) => {
        await handleOpenUrl(url);
      });
      removeUrlListener = () => urlHandle.remove();

      const actionHandle = await LocalNotifications.addListener(
        "localNotificationActionPerformed",
        ({ actionId }) => {
          if (actionId === "speak") requestListen();
        },
      );
      removeActionListener = () => actionHandle.remove();

      // Self-heal on resume too: returning from background after a
      // reboot, a force-stop, or a permission granted in Settings is
      // an app open in every sense that matters — re-post the Speak
      // notification if it is missing. ensureVoiceNotification is a
      // no-op when it is already posted.
      const resumeHandle = await App.addListener("resume", () => {
        void ensureVoiceNotification();
      });
      removeResumeListener = () => resumeHandle.remove();

      // Cold start from the widget / notification: the launch URL is
      // delivered here because the listener above only fires for
      // links opened while the app is already running.
      const launch = await App.getLaunchUrl().catch(() => undefined);
      if (launch?.url) await handleOpenUrl(launch.url);

      await ensureVoiceNotification();

      await SplashScreen.hide().catch(() => undefined);
    };

    void boot();

    return () => {
      void removeUrlListener?.();
      void removeActionListener?.();
      void removeResumeListener?.();
    };
  }, []);

  return null;
}
