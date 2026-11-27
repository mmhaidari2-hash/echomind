"use client";

/**
 * Connections hub (Local context drawer) — mockup 2.
 *
 * A horizontal row of glass icon tiles (the real 8 connectors, official
 * brand SVGs, green dot on the connected ones) under an "ACTIVE
 * CONNECTIONS" header with a live "N apps synced" pill. Tapping a
 * tile shows the selected app below: full name, live sync status,
 * what it powers, and a 1-tap Connect action. Below that, LIVE
 * WORKSPACE counters — Active Deadlines, Pending Follow-ups,
 * Connected Workspace — computed live from the Life Graph and the
 * hub states, never hardcoded.
 *
 * The app list and the status loading live in ./hubApps (shared with
 * HomeHub), so this drawer shows the SAME 8 apps with the SAME real
 * states: Gmail, Calendar, Drive, Docs, Sheets, Bank, Instagram,
 * YouTube. Only real connectors are shown. Slack and Notion have no
 * connector, so they sit in the honest "coming soon" strip, never in
 * the row. The hub never mocks a connection: if the backend is an
 * older build without these status endpoints, it says the connections
 * arrive with the next app update; if the user is not signed in, it
 * says so.
 */

import { useCallback, useState } from "react";

import { Browser } from "@capacitor/browser";

import { copy } from "../lib/copy";
import { BrandIcon } from "./BrandIcons";
import { Button } from "./ui/button";
import { SignInPrompt, StatusDot } from "./Glass";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import {
  HUB_APPS,
  HUB_COMING_SOON,
  emptyHubStates,
  hubAppCanConnect,
  loadHubStatuses,
  startHubAppConnection,
  type HubAppId,
  type HubState,
} from "./hubApps";
import { type LifeSnapshot } from "@/services/api";
import type { Locale } from "../lib/direction";

function stateLabel(state: HubState, locale: Locale): string {
  switch (state) {
    case "connected":
      return locale === "fa" ? "متصل" : "connected";
    case "not_connected":
      return locale === "fa" ? "متصل نیست" : "not connected";
    case "needs_setup":
      return locale === "fa" ? "نیاز به راه‌اندازی" : "needs setup";
    case "coming_soon":
      return locale === "fa" ? "به‌زودی" : "coming soon";
    default:
      return locale === "fa" ? "برای دیدن وضعیت وارد شوید" : "sign in to see status";
  }
}

export default function ConnectionsHub({
  locale,
  snapshot,
}: {
  locale: Locale;
  /** Life Graph snapshot for the LIVE WORKSPACE counters. */
  snapshot: LifeSnapshot | null;
}) {
  const t = copy[locale];
  const [states, setStates] = useState<Record<HubAppId, HubState>>(emptyHubStates);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [outdated, setOutdated] = useState(false);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    const {
      states: next,
      readFailed: failed,
      outdated: old,
      unauthenticated: noSession,
      googleConfigured: configured,
    } = await loadHubStatuses();
    setStates(next);
    setGoogleConfigured(configured);
    setReadFailed(failed);
    setOutdated(old);
    setUnauthenticated(noSession);
  }, []);

  /* No manual Refresh: status revalidates itself. */
  useLiveRefresh(load, { intervalMs: 30_000 });

  const connectedCount = HUB_APPS.filter((app) => states[app.id] === "connected").length;
  const selectedApp = HUB_APPS.find((app) => app.id === selected) ?? null;
  const selectedState = selectedApp ? states[selectedApp.id] : null;

  const activeDeadlines = snapshot
    ? snapshot.obligations.filter((item) => item.status === "overdue" || item.status === "due_soon").length
    : 0;
  const pendingFollowups = snapshot
    ? snapshot.promises.filter((item) => item.status === "open").length
    : 0;

  const connectSelected = async () => {
    if (!selectedApp) return;
    setBusy(true);
    setConnectError(null);
    try {
      const { authorization_url } = await startHubAppConnection(selectedApp);
      // Capacitor Browser (in-app tab), not window.open: opening the
      // OAuth page in the WebView itself would navigate the app away.
      await Browser.open({ url: authorization_url });
      window.setTimeout(() => void load(), 30_000);
    } catch (cause) {
      const detail = cause instanceof Error && cause.message ? cause.message : null;
      setConnectError(
        detail ??
          (locale === "fa"
            ? "صفحهٔ ورود باز نشد. اتصال را بررسی کنید و دوباره تلاش کنید."
            : "Could not open the sign-in page. Check your connection and try again."),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="echomind-glass-bevel w-full min-w-0 rounded-[1.4rem] p-4" aria-label={locale === "fa" ? "اتصال‌ها" : "Connections"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="echomind-meta min-w-0 flex-1 text-gold [overflow-wrap:break-word]">
          {locale === "fa" ? "اتصال‌های فعال" : "Active connections"}
        </p>
        <span className="shrink-0 whitespace-nowrap rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
          {locale === "fa"
            ? `${connectedCount} برنامه همگام شد`
            : `${connectedCount} app${connectedCount === 1 ? "" : "s"} synced`}
        </span>
      </div>

      {/* Icon node grid — 4 columns, all 8 apps visible at once. The
          old horizontally-scrolling row left the 4th tile half off
          the right edge, which read as a broken layout. Each tile is
          a raised beveled medallion now. Green dot = live. */}
      <div className="mt-3 grid w-full grid-cols-4 gap-2.5">
        {HUB_APPS.map((app) => {
          const state = states[app.id];
          const isSelected = selected === app.id;
          return (
            <button
              key={app.id}
              type="button"
              onClick={() => setSelected(app.id === selected ? null : app.id)}
              aria-pressed={isSelected}
              aria-label={`${app.label[locale]} — ${stateLabel(state, locale)}`}
              className={`echomind-medallion relative flex h-14 w-full min-w-0 items-center justify-center rounded-2xl ${
                isSelected ? "ring-2 ring-gold/70" : ""
              }`}
            >
              <BrandIcon id={app.icon} className="h-7 w-7" />
              {state === "connected" ? (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-obsidian bg-emerald-400"
                />
              ) : state === "needs_setup" ? (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-obsidian"
                >
                  !
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {outdated ? (
        <p role="status" className="mt-2 w-full min-w-0 text-xs leading-relaxed text-muted [overflow-wrap:break-word]">
          {locale === "fa"
            ? "اتصال‌ها با به‌روزرسانی بعدی برنامه می‌آیند — سرور هنوز نسخهٔ قدیمی را اجرا می‌کند."
            : "Connections arrive with the next app update — the server still runs the older version."}
        </p>
      ) : readFailed && unauthenticated ? (
        <SignInPrompt locale={locale} message={t.signInPrompt} />
      ) : readFailed ? (
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 min-h-10 rounded-full border border-white/[0.09] px-4 text-xs font-semibold text-ink-soft hover:text-gold"
        >
          {t.retryAction}
        </button>
      ) : null}

      {selectedApp && selectedState ? (
        <div className="mt-2 w-full min-w-0 rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 py-2">
          <p className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="echomind-num-mono shrink-0 text-[11px] text-gold">
              APP {String(HUB_APPS.findIndex((a) => a.id === selectedApp.id) + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1 text-xs font-semibold text-ink [overflow-wrap:break-word]">{selectedApp.label[locale]}</span>
            <StatusDot
              tone={
                selectedState === "connected"
                  ? "ok"
                  : selectedState === "needs_setup"
                    ? "warn"
                    : "idle"
              }
              label={stateLabel(selectedState, locale)}
            />
          </p>
          <p className="mt-0.5 w-full min-w-0 text-[11px] text-muted [overflow-wrap:break-word]">
            {locale === "fa" ? selectedApp.powers.fa : selectedApp.powers.en}
          </p>
          {selectedState === "needs_setup" && selectedApp.setupNote ? (
            <p className="mt-1 w-full min-w-0 text-[11px] leading-relaxed text-gold [overflow-wrap:break-word]">
              {locale === "fa" ? selectedApp.setupNote.fa : selectedApp.setupNote.en}
            </p>
          ) : null}
          {selectedState === "unknown" ? (
            <p className="mt-1 w-full min-w-0 text-[11px] leading-relaxed text-muted [overflow-wrap:break-word]">
              {locale === "fa"
                ? "اول وارد اکومایند شوید، بعد برنامه‌هایتان را از همین‌جا وصل کنید."
                : "Sign in to EchoMind first, then connect your apps from here."}
            </p>
          ) : null}
          {hubAppCanConnect(selectedApp, selectedState, googleConfigured) ? (
            <Button size="sm" className="mt-2" disabled={busy} onClick={() => void connectSelected()}>
              {locale === "fa" ? "وصل کردن" : "Connect"}
            </Button>
          ) : null}
          {connectError ? (
            <p role="alert" className="mt-2 text-xs text-red-300">
              {connectError}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">
          {locale === "fa"
            ? "روی یک برنامه بزن تا ببینی چه چیزی را تغذیه می‌کند."
            : "Tap an app to see what it powers."}
        </p>
      )}

      {/* LIVE WORKSPACE — live counters, never hardcoded numbers.
          Each metric is a clean vertical stack (number, label) with
          explicit line-height, so "Active" can never overlap
          "Deadlines" again. */}
      <div className="mt-4 w-full min-w-0 border-t border-white/[0.09] pt-3">
        <p className="echomind-meta text-gold">
          {locale === "fa" ? "فضای کاری زنده" : "Live workspace"}
        </p>
        <div className="mt-2 grid w-full grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-gold/30 bg-gold/[0.05] p-3">
            <p className="echomind-num-mono text-2xl leading-none text-gold">{activeDeadlines}</p>
            <p className="w-full min-w-0 text-xs leading-[1.3] text-ink-soft [overflow-wrap:break-word]">
              {locale === "fa" ? "مهلت فعال" : "Active Deadlines"}
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-gold/30 bg-gold/[0.05] p-3">
            <p className="echomind-num-mono text-2xl leading-none text-gold">{pendingFollowups}</p>
            <p className="w-full min-w-0 text-xs leading-[1.3] text-ink-soft [overflow-wrap:break-word]">
              {locale === "fa" ? "پیگیری در انتظار" : "Pending Follow-up"}
            </p>
          </div>
          <div className="col-span-2 flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-white/[0.09] bg-white/[0.04] px-3 py-2.5">
            <p className="min-w-0 flex-1 text-xs font-semibold leading-[1.3] text-ink-soft [overflow-wrap:break-word]">
              {locale === "fa" ? "فضای کاری متصل" : "Connected Workspace"}
            </p>
            <p className="echomind-num-mono shrink-0 text-sm text-gold">
              {connectedCount}/{HUB_APPS.length}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted">
            {locale === "fa" ? "به‌زودی:" : "Coming soon:"}
          </span>
          {HUB_COMING_SOON.map((app) => (
            <span key={app.label.en} className="flex items-center gap-1.5 rounded-full border border-white/[0.09] px-2.5 py-1 text-[11px] text-muted">
              <BrandIcon id={app.icon} className="h-3.5 w-3.5" />
              {locale === "fa" ? app.label.fa : app.label.en}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          {locale === "fa"
            ? "اتصال‌ها یک سطح‌اند؛ مهلت‌ها، قول‌ها، نتیجه‌ها و پروژه‌ها در گراف زندگی به هم وصل‌اند."
            : "Connections are one surface — deadlines, promises, outcomes and projects all meet in the Life Graph."}
        </p>
      </div>
    </section>
  );
}
