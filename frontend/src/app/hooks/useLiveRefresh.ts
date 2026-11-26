"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Reactive state updates without a manual Refresh button.
 *
 * Calls `load` on mount, then revalidates on a quiet interval, when
 * the tab regains focus or becomes visible, and when the auth session
 * becomes ready (`echomind-auth-ready`). No new dependency — plain
 * hooks only. `refreshNow` is exposed for the rare case a user action
 * must re-check immediately (e.g. right after an OAuth tab closes).
 *
 * Guards against overlapping loads and against setState after
 * unmount. The interval is paused while the tab is hidden so a phone
 * coming back from sleep does one fresh load instead of a backlog.
 */
export function useLiveRefresh(
  load: () => Promise<void> | void,
  options?: { intervalMs?: number; enabled?: boolean },
): { refreshNow: () => void } {
  const intervalMs = options?.intervalMs ?? 30_000;
  const enabled = options?.enabled ?? true;
  const loadRef = useRef(load);
  loadRef.current = load;
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  const refreshNow = useCallback(() => {
    if (!mountedRef.current || runningRef.current) return;
    runningRef.current = true;
    void Promise.resolve()
      .then(() => loadRef.current())
      .catch(() => undefined)
      .finally(() => {
        runningRef.current = false;
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;
    refreshNow();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshNow();
    }, intervalMs);
    const onFocus = () => refreshNow();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshNow();
    };
    const onAuth = () => refreshNow();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("echomind-auth-ready", onAuth);
    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("echomind-auth-ready", onAuth);
    };
  }, [enabled, intervalMs, refreshNow]);

  return { refreshNow };
}
