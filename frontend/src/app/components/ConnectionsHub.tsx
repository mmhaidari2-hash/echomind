"use client";

/**
 * Connections hub — EchoMind's apps, orbiting EchoMind.
 *
 * Better than the reference Mahdi sent (a flat hub-and-spoke card):
 * the hub is glassy 3D (glass orb centre, depth, glow), it shows what
 * each connection POWERS (which engines it feeds), and it sits inside
 * the wider EchoMind — Life Graph, Obligation Engine, Promise Tracker,
 * Outcome Loop, project delegation, bilingual Persian + English — so
 * the hub never reads as the whole product.
 *
 * Only real connectors are shown. Gmail and Calendar are real: their
 * state comes from the repo's Google OAuth
 * (GET /connectors/google/status, per-scope). Drive, Docs and Sheets
 * are the same Google account's next scopes — marked "soon", never
 * shown as connected. Slack, Notion and Instagram are omitted: the
 * repo has no connector for them and none is planned there. The hub
 * never mocks a connection: if the status cannot be read, it says so.
 */

import { useEffect, useState } from "react";

import {
  ApiError,
  getGoogleConnectorStatus,
  startGoogleConnection,
  type GoogleConnectorStatus,
} from "@/services/api";
import type { Locale } from "../lib/direction";

type HubApp = {
  id: string;
  name: string;
  nameFa: string;
  mark: string;
  tint: string;
  x: number; // percent, left
  y: number; // percent, top
  state: "connected" | "unconnected" | "soon";
  powersEn: string;
  powersFa: string;
};

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

const SPOKES: Array<Omit<HubApp, "state">> = [
  { id: "gmail", name: "Gmail", nameFa: "جیمیل", mark: "M", tint: "bg-red-400/15 text-red-300 border-red-400/30", x: 50, y: 4, powersEn: "Inbox Watch · Promise Chaser · Outcome Verifier", powersFa: "بررسی صندوق · پیگیری قول · تأیید نتیجه" },
  { id: "drive", name: "Drive", nameFa: "درایو", mark: "D", tint: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30", x: 88, y: 50, powersEn: "Evidence for cases — soon", powersFa: "مدرک پرونده‌ها — به‌زودی" },
  { id: "docs", name: "Docs", nameFa: "داکس", mark: "D", tint: "bg-sky-400/15 text-sky-300 border-sky-400/30", x: 71, y: 88, powersEn: "Case files and notices — soon", powersFa: "پرونده‌ها و اطلاعیه‌ها — به‌زودی" },
  { id: "sheets", name: "Sheets", nameFa: "شیتس", mark: "S", tint: "bg-green-400/15 text-green-300 border-green-400/30", x: 29, y: 88, powersEn: "Costs and renewals — soon", powersFa: "هزینه‌ها و تمدیدها — به‌زودی" },
  { id: "calendar", name: "Calendar", nameFa: "تقویم", mark: "31", tint: "bg-blue-400/15 text-blue-300 border-blue-400/30", x: 12, y: 50, powersEn: "Travel Guard · Calendar Guard · Morning Brief", powersFa: "نگهبان سفر · نگهبان تقویم · خلاصه صبح" },
];

const ENGINES: Array<{ en: string; fa: string }> = [
  { en: "Life Graph", fa: "گراف زندگی" },
  { en: "Obligation Engine", fa: "موتور مهلت‌ها" },
  { en: "Promise Tracker", fa: "پیگیر قول‌ها" },
  { en: "Outcome Loop", fa: "حلقه نتیجه" },
  { en: "Project delegation", fa: "واگذاری پروژه" },
];

export default function ConnectionsHub({ locale }: { locale: Locale }) {
  const [status, setStatus] = useState<GoogleConnectorStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getGoogleConnectorStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const scopes = status?.scopes ?? [];
  const gmailConnected = Boolean(status?.connected && scopes.includes(GMAIL_SCOPE));
  const calendarConnected = Boolean(status?.connected && scopes.includes(CALENDAR_SCOPE));
  const connectedCount = [gmailConnected, calendarConnected].filter(Boolean).length;

  const apps: HubApp[] = SPOKES.map((spoke) => ({
    ...spoke,
    state:
      spoke.id === "gmail"
        ? gmailConnected
          ? "connected"
          : "unconnected"
        : spoke.id === "calendar"
          ? calendarConnected
            ? "connected"
            : "unconnected"
          : "soon",
  }));

  const connectGoogle = async () => {
    setBusy(true);
    try {
      const { authorization_url } = await startGoogleConnection("read");
      window.open(authorization_url, "_blank", "noopener");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const selectedApp = apps.find((app) => app.id === selected) ?? null;

  return (
    <section className="echomind-glass rounded-[1.4rem] p-4" aria-label={locale === "fa" ? "اتصال‌ها" : "Connections"}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300/80">
          {locale === "fa" ? "اتصال‌ها" : "Connections"}
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          {locale === "fa"
            ? `${connectedCount} برنامه متصل`
            : `${connectedCount} app${connectedCount === 1 ? "" : "s"} connected`}
        </span>
      </div>

      <div className="echomind-scene relative mx-auto mt-2 h-[300px] w-full max-w-[340px]">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden>
          {apps.map((app) => (
            <line
              key={app.id}
              x1="50"
              y1="50"
              x2={app.x}
              y2={app.y}
              stroke={app.state === "connected" ? "rgba(52, 211, 153, 0.55)" : "rgba(148, 163, 184, 0.25)"}
              strokeWidth={app.state === "connected" ? 0.9 : 0.6}
            />
          ))}
        </svg>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="echomind-orb-3d mx-auto h-20 w-20" aria-hidden />
          <p className="mt-1 text-xs font-bold text-slate-100">EchoMind</p>
        </div>
        {apps.map((app) => (
          <button
            key={app.id}
            type="button"
            onClick={() => setSelected(app.id === selected ? null : app.id)}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${app.x}%`, top: `${app.y}%` }}
            aria-label={`${app.name} — ${app.state}`}
          >
            <span
              className={`echomind-tilt relative flex h-14 w-14 items-center justify-center rounded-2xl border text-lg font-bold backdrop-blur-md ${
                app.tint
              } ${app.state === "soon" ? "opacity-55" : ""}`}
            >
              {app.mark}
              {app.state === "connected" ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-[11px] font-bold text-slate-950" aria-hidden>
                  ✓
                </span>
              ) : null}
            </span>
            <span className="mt-1 block text-center text-[11px] font-medium text-slate-300">
              {locale === "fa" ? app.nameFa : app.name}
              {app.state === "soon" ? (locale === "fa" ? " (به‌زودی)" : " (soon)") : ""}
            </span>
          </button>
        ))}
      </div>

      {failed ? (
        <p role="alert" className="mt-2 text-xs text-rose-300">
          {locale === "fa" ? "وضعیت اتصال خوانده نشد." : "Connection status could not be read."}
        </p>
      ) : null}

      {selectedApp ? (
        <div className="mt-2 rounded-xl border border-slate-800 px-3 py-2">
          <p className="text-xs font-medium text-slate-200">
            {locale === "fa" ? selectedApp.nameFa : selectedApp.name}
            {selectedApp.state === "connected"
              ? locale === "fa"
                ? " — متصل"
                : " — connected"
              : selectedApp.state === "soon"
                ? locale === "fa"
                  ? " — به‌زودی"
                  : " — coming soon"
                : locale === "fa"
                  ? " — متصل نیست"
                  : " — not connected"}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {locale === "fa" ? selectedApp.powersFa : selectedApp.powersEn}
          </p>
          {selectedApp.state === "unconnected" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void connectGoogle()}
              className="mt-2 min-h-9 rounded-full bg-sky-300 px-4 text-xs font-semibold text-slate-950 disabled:opacity-50"
            >
              {locale === "fa" ? "وصل کردن" : "Connect"}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          {locale === "fa"
            ? "روی یک برنامه بزن تا ببینی چه چیزی را تغذیه می‌کند."
            : "Tap an app to see what it powers."}
        </p>
      )}

      <div className="mt-3 border-t border-slate-800 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {locale === "fa" ? "بخشی از اکومایند گسترده‌تر" : "Part of the wider EchoMind"}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ENGINES.map((engine) => (
            <span key={engine.en} className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300">
              {locale === "fa" ? engine.fa : engine.en}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          {locale === "fa"
            ? "اتصال‌ها یک سطح‌اند؛ مهلت‌ها، قول‌ها، نتیجه‌ها و پروژه‌ها در گراف زندگی به هم وصل‌اند."
            : "Connections are one surface — deadlines, promises, outcomes and projects all meet in the Life Graph."}
        </p>
      </div>
    </section>
  );
}
