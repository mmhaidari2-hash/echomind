"use client";

import { useEffect, useState } from "react";

import { isNativeApp } from "../lib/native";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onPrompt = (incoming: Event) => {
      incoming.preventDefault();
      setEvent(incoming as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (isNativeApp() || !event || hidden) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(4.75rem+env(safe-area-inset-top))] z-40 flex justify-center px-3">
      <div className="pointer-events-auto flex w-full max-w-3xl items-center justify-between gap-3 rounded-2xl border border-white/[0.09] bg-obsidian/95 px-3 py-2.5 text-xs text-ink-soft shadow-lift backdrop-blur-xl">
        <p className="min-w-0">
          <span className="block font-semibold text-ink">Install EchoMind</span>
          <span className="block text-muted">Add to your home screen for offline access.</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rounded-full px-2 py-1 text-muted hover:text-ink"
            onClick={() => setHidden(true)}
          >
            Not now
          </button>
          <button
            type="button"
            className="rounded-full bg-gold/20 px-3 py-1 font-semibold text-gold"
            onClick={() => {
              void event.prompt().then(() => setHidden(true));
            }}
          >
            Install
          </button>
        </div>
      </div>
    </div>
  );
}
