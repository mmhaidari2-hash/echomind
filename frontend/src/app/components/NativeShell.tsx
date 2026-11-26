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

/** Persistent voice notification: an ongoing, silent EchoMind
    notification with a Speak action, visible on the lock screen, so
    Mahdi can talk hands-free (train, bus, ship) without opening the
    app first. Built on the LocalNotifications plugin already in the
    app — no new dependency, no foreground service. The plugin
    restores scheduled notifications after a reboot, and
    `ongoing: true` means it cannot be swiped away; tapping Speak
    launches the app and the retained action event starts listening.
    If notification permission is denied the call fails silently —
    the home-screen widget still works. */
async function ensureVoiceNotification() {
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
    id: "echomind-voice",
    name: "EchoMind voice",
    description: fa
      ? "میانبر صوتی همیشگی اکومایند"
      : "EchoMind always-on voice shortcut",
    // Low importance: silent (no sound, no vibration, no heads-up)
    // but still visible in the shade and on the lock screen.
    importance: 3,
    // Public: full content on the lock screen.
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
        channelId: "echomind-voice",
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

    const boot = async () => {
      await StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
      await StatusBar.setBackgroundColor({ color: "#090A0F" }).catch(() => undefined);
      await LocalNotifications.requestPermissions().catch(() => undefined);

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
    };
  }, []);

  return null;
}
