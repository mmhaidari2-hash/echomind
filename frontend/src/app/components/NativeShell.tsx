"use client";

import { useEffect } from "react";

import { LocalNotifications } from "@capacitor/local-notifications";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

import { isNativeApp } from "../lib/native";

export default function NativeShell() {
  useEffect(() => {
    if (!isNativeApp()) {
      return;
    }

    const boot = async () => {
      await StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
      await StatusBar.setBackgroundColor({ color: "#090d16" }).catch(() => undefined);
      await LocalNotifications.requestPermissions().catch(() => undefined);
      await SplashScreen.hide().catch(() => undefined);
    };

    void boot();
  }, []);

  return null;
}
