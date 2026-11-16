"use client";

import { useEffect } from "react";

import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { LocalNotifications } from "@capacitor/local-notifications";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

import { isNativeApp } from "../lib/native";

export default function NativeShell() {
  useEffect(() => {
    if (!isNativeApp()) {
      return;
    }

    let removeUrlListener: (() => Promise<void>) | undefined;

    const boot = async () => {
      await StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
      await StatusBar.setBackgroundColor({ color: "#090d16" }).catch(() => undefined);
      await LocalNotifications.requestPermissions().catch(() => undefined);

      const handle = await App.addListener("appUrlOpen", async ({ url }) => {
        if (!url.startsWith("echomind://oauth/google")) return;
        await Browser.close().catch(() => undefined);
        window.dispatchEvent(new Event("echomind-google-connected"));
      });
      removeUrlListener = () => handle.remove();

      await SplashScreen.hide().catch(() => undefined);
    };

    void boot();

    return () => {
      void removeUrlListener?.();
    };
  }, []);

  return null;
}
