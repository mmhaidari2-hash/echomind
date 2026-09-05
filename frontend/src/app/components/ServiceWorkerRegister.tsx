"use client";

import { useEffect } from "react";

import { isNativeApp } from "../lib/native";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (isNativeApp() || !("serviceWorker" in navigator)) {
      return;
    }
    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    };
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
