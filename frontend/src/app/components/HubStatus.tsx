"use client";

import { useCallback, useState } from "react";

import { copy } from "../lib/copy";
import type { Locale } from "../lib/direction";
import { StatusDot } from "./Glass";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import {
  getHubStatus,
  isEndpointMissing,
  saveHubSession,
  type HubConnection,
} from "@/services/api";

/**
 * Command hub — the generic, pluggable slot. For Mahdi it is
 * MENTOR; for anyone else it stays empty until they plug in
 * whatever hub they like. The hub runs the work EchoMind hands
 * over, so EchoMind can be commanded hands-free by voice
 * instead of opening the hub by hand.
 *
 * The hub speaks its dashboard form (repo + instruction +
 * engine → redirect to /app/agents/{id}); MENTOR's production
 * app is the pre-filled example, never a hard requirement.
 * The session cookie is stored encrypted server-side and never
 * shown back — the panel only says whether one is set and
 * whether it still works.
 */
export default function HubStatus({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const [connection, setConnection] = useState<HubConnection | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  /** The backend is an older build without /mentor (merge pending). */
  const [outdated, setOutdated] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [cookie, setCookie] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const row = await getHubStatus();
      setConnection(row);
      setEndpoint(row.endpoint);
      setReadFailed(false);
      setOutdated(false);
    } catch (error) {
      setReadFailed(true);
      setOutdated(isEndpointMissing(error));
    }
  }, []);

  /* No manual Refresh: revalidates on mount, interval, focus,
     visibility and auth-ready. */
  useLiveRefresh(refresh, { intervalMs: 60_000 });

  const save = async () => {
    const endpointValue = endpoint.trim();
    const cookieValue = cookie.trim();
    if (!endpointValue && !cookieValue) return;
    setBusy(true);
    try {
      const row = await saveHubSession({
        endpoint: endpointValue || undefined,
        session_cookie: cookieValue || undefined,
      });
      setConnection(row);
      setCookie("");
      setNotice(row.has_session ? t.hubSessionSet : t.hubSaved);
    } catch {
      setNotice(t.hubUnavailable);
    } finally {
      setBusy(false);
    }
  };

  const tone = (row: HubConnection): "ok" | "warn" | "idle" => {
    if (row.worker_state === "ready") return "ok";
    if (row.worker_state === "paused" || row.worker_state === "needs-sign-in") return "warn";
    return "idle";
  };

  const stateLabel = (row: HubConnection): string => {
    switch (row.worker_state) {
      case "empty":
        return t.hubEmpty;
      case "ready":
        return t.hubReady;
      case "paused":
        return t.hubPaused;
      case "needs-sign-in":
        return row.has_session ? t.hubSessionExpired : t.hubNeedsSignIn;
      default:
        return t.hubUnknown;
    }
  };

  return (
    <section className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4">
      <h3 className="font-sans text-base font-semibold text-ink">{t.hubTitle}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">{t.hubHint}</p>
      {readFailed ? (
        <p className="mt-3 text-xs text-red-400">{t.hubUnavailable}</p>
      ) : connection === null ? (
        <p className="mt-3 text-xs text-muted">…</p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="echomind-num-mono truncate text-xs text-muted">
              {connection.endpoint || "—"}
            </p>
            <StatusDot tone={tone(connection)} label={stateLabel(connection)} />
          </div>
          {connection.paused === true && (
            <p className="mt-2 text-xs leading-relaxed text-amber-300">{t.hubPausedHint}</p>
          )}
          {connection.detail && connection.worker_state !== "empty" && (
            <p className="mt-2 text-xs leading-relaxed text-muted">{connection.detail}</p>
          )}
          <div className="mt-3 flex flex-col gap-2">
            <label className="text-xs text-muted">
              {t.hubEndpoint}
              <input
                type="text"
                value={endpoint}
                placeholder={t.hubEndpointPlaceholder}
                onChange={(event) => setEndpoint(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/[0.09] bg-white/[0.05] px-2 py-1.5 font-mono text-sm text-ink"
              />
            </label>
            <label className="text-xs text-muted">
              {t.hubSession}
              <input
                type="password"
                value={cookie}
                placeholder={t.hubSessionPlaceholder}
                autoComplete="off"
                onChange={(event) => setCookie(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/[0.09] bg-white/[0.05] px-2 py-1.5 text-sm text-ink"
              />
            </label>
            <p className="text-[11px] leading-relaxed text-muted">{t.hubHowTo}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy || (!endpoint.trim() && !cookie.trim())}
                className="rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-obsidian disabled:opacity-50"
              >
                {t.hubSave}
              </button>
              {connection.has_session && (
                <span className="text-[11px] font-semibold text-emerald-300">{t.hubSessionSet}</span>
              )}
              {notice && <span className="text-[11px] text-muted">{notice}</span>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
