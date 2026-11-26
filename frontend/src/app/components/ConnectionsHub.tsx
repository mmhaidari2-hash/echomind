"use client";

/**
 * Connections hub (Local context drawer) — EchoMind's apps, orbiting
 * EchoMind.
 *
 * Better than the reference Mahdi sent (a flat hub-and-spoke card):
 * the hub is warm glassy 3D (honey orb centre, depth, glow), it shows
 * what each connection POWERS (which engines it feeds), and it sits
 * inside the wider EchoMind — Life Graph, Obligation Engine, Promise
 * Tracker, Outcome Loop, project delegation, bilingual Persian +
 * English — so the hub never reads as the whole product.
 *
 * The app list and the status loading live in ./hubApps (shared with
 * HomeHub), so this drawer shows the SAME 8 apps with the SAME real
 * states: Gmail, Calendar, Drive, Docs, Sheets, Bank, Instagram,
 * YouTube. Bank, Instagram and YouTube used to be missing here even
 * though their connectors exist — that was the bug. Only real
 * connectors are shown. Slack and Notion have no connector, so they
 * sit in the honest "coming soon" strip, never in the orbit. The hub
 * never mocks a connection: if every status endpoint fails to answer,
 * it says the status could not be read.
 */

import { useEffect, useState } from "react";

import { Button } from "./ui/button";
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
import type { Locale } from "../lib/direction";

const ENGINES: Array<{ en: string; fa: string }> = [
  { en: "Life Graph", fa: "گراف زندگی" },
  { en: "Obligation Engine", fa: "موتور مهلت‌ها" },
  { en: "Promise Tracker", fa: "پیگیر قول‌ها" },
  { en: "Outcome Loop", fa: "حلقه نتیجه" },
  { en: "Project delegation", fa: "واگذاری پروژه" },
];

/** Orbit geometry: 8 nodes, clockwise from the top. */
const ANGLES = [-90, -45, 0, 45, 90, 135, 180, 225];
const ORBIT_RADIUS = 42;

function nodePosition(index: number): { x: number; y: number } {
  const radians = (ANGLES[index] * Math.PI) / 180;
  return {
    x: 50 + ORBIT_RADIUS * Math.cos(radians),
    y: 50 + ORBIT_RADIUS * Math.sin(radians),
  };
}

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

export default function ConnectionsHub({ locale }: { locale: Locale }) {
  const [states, setStates] = useState<Record<HubAppId, HubState>>(emptyHubStates);
  const [readFailed, setReadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    const { states: next, readFailed: failed } = await loadHubStatuses();
    setStates(next);
    setReadFailed(failed);
  };

  useEffect(() => {
    let cancelled = false;
    void load().catch(() => {
      if (!cancelled) setReadFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const connectedCount = HUB_APPS.filter((app) => states[app.id] === "connected").length;
  const selectedApp = HUB_APPS.find((app) => app.id === selected) ?? null;
  const selectedState = selectedApp ? states[selectedApp.id] : null;

  const connectSelected = async () => {
    if (!selectedApp) return;
    setBusy(true);
    setConnectError(null);
    try {
      const { authorization_url } = await startHubAppConnection(selectedApp);
      window.open(authorization_url, "_blank", "noopener");
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
    <section className="echomind-glass rounded-[1.4rem] p-4" aria-label={locale === "fa" ? "اتصال‌ها" : "Connections"}>
      <div className="flex items-center justify-between gap-2">
        <p className="spark-eyebrow">
          {locale === "fa" ? "اتصال‌ها" : "Connections"}
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-600/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden />
          {locale === "fa"
            ? `${connectedCount} برنامه متصل`
            : `${connectedCount} app${connectedCount === 1 ? "" : "s"} connected`}
        </span>
      </div>

      <div className="echomind-scene relative mx-auto mt-2 h-[300px] w-full max-w-[340px]">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden>
          <circle
            cx="50"
            cy="50"
            r={ORBIT_RADIUS}
            fill="none"
            stroke="rgba(183, 121, 31, 0.3)"
            strokeWidth="0.5"
            strokeDasharray="1.5 1.5"
          />
          {HUB_APPS.map((app, index) => {
            const { x, y } = nodePosition(index);
            return (
              <line
                key={app.id}
                x1="50"
                y1="50"
                x2={x}
                y2={y}
                stroke={states[app.id] === "connected" ? "rgba(5, 122, 85, 0.5)" : "rgba(183, 121, 31, 0.3)"}
                strokeWidth={states[app.id] === "connected" ? 0.9 : 0.6}
              />
            );
          })}
        </svg>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="echomind-orb-3d mx-auto h-20 w-20" aria-hidden />
          <p className="mt-1 text-xs font-bold text-bark">EchoMind</p>
        </div>
        {HUB_APPS.map((app, index) => {
          const { x, y } = nodePosition(index);
          const state = states[app.id];
          return (
            <button
              key={app.id}
              type="button"
              onClick={() => setSelected(app.id === selected ? null : app.id)}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%` }}
              aria-label={`${app.label[locale]} — ${stateLabel(state, locale)}`}
            >
              <span
                className={`echomind-tilt relative flex h-14 w-14 items-center justify-center rounded-2xl border text-lg font-bold backdrop-blur-md ${
                  state === "connected"
                    ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-700"
                    : state === "needs_setup"
                      ? "border-honey/40 bg-honey/10 text-honey-deep"
                      : "border-bark/15 bg-cream/70 text-bark-soft"
                } ${state === "coming_soon" ? "opacity-55" : ""}`}
              >
                {app.glyph}
                {state === "connected" ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-cream" aria-hidden>
                    ✓
                  </span>
                ) : state === "needs_setup" ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-honey text-[11px] font-bold text-cream" aria-hidden>
                    !
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block text-center text-[11px] font-medium text-clay">
                {app.label[locale]}
                {state === "coming_soon" ? (locale === "fa" ? " (به‌زودی)" : " (soon)") : ""}
              </span>
            </button>
          );
        })}
      </div>

      {readFailed ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {locale === "fa" ? "وضعیت اتصال خوانده نشد." : "Connection status could not be read."}
        </p>
      ) : null}

      {selectedApp && selectedState ? (
        <div className="mt-2 rounded-xl border border-bark/10 bg-cream/70 px-3 py-2">
          <p className="text-xs font-medium text-bark">
            {selectedApp.label[locale]}
            {" — "}
            {stateLabel(selectedState, locale)}
          </p>
          <p className="mt-0.5 text-[11px] text-clay">
            {locale === "fa" ? selectedApp.powers.fa : selectedApp.powers.en}
          </p>
          {selectedState === "needs_setup" && selectedApp.setupNote ? (
            <p className="mt-1 text-[11px] leading-relaxed text-honey-deep">
              {locale === "fa" ? selectedApp.setupNote.fa : selectedApp.setupNote.en}
            </p>
          ) : null}
          {selectedState === "unknown" ? (
            <p className="mt-1 text-[11px] leading-relaxed text-clay">
              {locale === "fa"
                ? "اول وارد اکومایند شوید، بعد برنامه‌هایتان را از همین‌جا وصل کنید."
                : "Sign in to EchoMind first, then connect your apps from here."}
            </p>
          ) : null}
          {hubAppCanConnect(selectedApp, selectedState) ? (
            <Button size="sm" className="mt-2" disabled={busy} onClick={() => void connectSelected()}>
              {locale === "fa" ? "وصل کردن" : "Connect"}
            </Button>
          ) : null}
          {connectError ? (
            <p role="alert" className="mt-2 text-xs text-red-700">
              {connectError}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-clay">
          {locale === "fa"
            ? "روی یک برنامه بزن تا ببینی چه چیزی را تغذیه می‌کند."
            : "Tap an app to see what it powers."}
        </p>
      )}

      <div className="mt-3 border-t border-bark/10 pt-3">
        <p className="spark-eyebrow">
          {locale === "fa" ? "بخشی از اکومایند گسترده‌تر" : "Part of the wider EchoMind"}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ENGINES.map((engine) => (
            <span key={engine.en} className="rounded-full border border-bark/15 px-2.5 py-1 text-[11px] text-bark-soft">
              {locale === "fa" ? engine.fa : engine.en}
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-clay">
            {locale === "fa" ? "به‌زودی:" : "Coming soon:"}
          </span>
          {HUB_COMING_SOON.map((app) => (
            <span key={app.label.en} className="rounded-full border border-bark/15 px-2.5 py-1 text-[11px] text-clay">
              {locale === "fa" ? app.label.fa : app.label.en}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-clay">
          {locale === "fa"
            ? "اتصال‌ها یک سطح‌اند؛ مهلت‌ها، قول‌ها، نتیجه‌ها و پروژه‌ها در گراف زندگی به هم وصل‌اند."
            : "Connections are one surface — deadlines, promises, outcomes and projects all meet in the Life Graph."}
        </p>
      </div>
    </section>
  );
}
