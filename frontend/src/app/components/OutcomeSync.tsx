"use client";

import { useEffect } from "react";

import { LocalNotifications } from "@capacitor/local-notifications";

import { isNativeApp } from "../lib/native";
import { getPendingOutcomes, type OutcomeItem } from "@/services/api";

function stableNotificationId(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return (hash % 2_000_000_000) + 1;
}

function notificationTime(item: OutcomeItem): Date {
  const now = new Date();
  if (!item.due_date || item.priority === "urgent") {
    return new Date(now.getTime() + 5_000);
  }
  const due = new Date(`${item.due_date}T09:00:00`);
  const dayBefore = new Date(due.getTime() - 24 * 60 * 60 * 1000);
  return dayBefore > now ? dayBefore : new Date(now.getTime() + 5_000);
}

export default function OutcomeSync() {
  useEffect(() => {
    if (!isNativeApp()) return;

    let cancelled = false;

    const sync = async () => {
      try {
        const items = (await getPendingOutcomes()).slice(0, 20);
        if (cancelled) return;

        const ids = items.map((item) => ({ id: stableNotificationId(item.id) }));
        if (ids.length) {
          await LocalNotifications.cancel({ notifications: ids }).catch(() => undefined);
        }
        if (!items.length) return;

        await LocalNotifications.schedule({
          notifications: items.map((item) => ({
            id: stableNotificationId(item.id),
            title: item.title,
            body: item.reason,
            schedule: { at: notificationTime(item) },
            extra: {
              echomindOutcome: item.id,
              kind: item.kind,
              sourceId: item.source_id,
              verification: item.requires_verification,
            },
          })),
        });
      } catch {
        // Auth/network failures stay silent; the app surfaces them in its normal UI.
      }
    };

    void sync();
    const onReady = () => void sync();
    const onFocus = () => {
      if (document.visibilityState === "visible") void sync();
    };
    window.addEventListener("echomind-auth-ready", onReady);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("echomind-auth-ready", onReady);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  return null;
}
