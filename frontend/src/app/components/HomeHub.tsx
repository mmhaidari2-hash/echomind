"use client";

/**
 * HomeHub — the home screen IS the hub.
 *
 * EchoMind's orb at the centre, the owner's apps orbiting it in a circle
 * connected by spokes, a "N apps connected" pill at the top, green
 * checkmarks on the connected apps. Tapping an app answers "so what?" —
 * what that connection powers inside EchoMind.
 *
 * Every state comes from a real status endpoint (Google, Instagram,
 * YouTube, Bank). Nothing is mocked: an app with no connector, no keys,
 * or no granted scope shows as "needs setup" / "not connected" /
 * "coming soon" — never a fake checkmark. Slack and Notion have no
 * connector, so they sit in the honest "coming soon" strip, not in the
 * orbit. Instagram here is EchoMind's own connector, not Muse's.
 *
 * Bilingual EN/FA; the orbit is symmetric so RTL needs no mirror.
 */

import { useCallback, useEffect, useState } from "react";

import { GlassCard, Orb3D, Reveal } from "./Glass";
import {
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_DOCS_SCOPE,
  GOOGLE_DRIVE_SCOPE,
  GOOGLE_GMAIL_SCOPE,
  GOOGLE_SHEETS_SCOPE,
  getBankStatus,
  getGoogleConnectorStatus,
  getInstagramStatus,
  getYouTubeStatus,
  startBankConnection,
  startGoogleConnection,
  startInstagramConnection,
  startYouTubeConnection,
} from "@/services/api";

type Lang = "en" | "fa";

type HubState = "connected" | "not_connected" | "needs_setup" | "coming_soon" | "unknown";

type HubAppId =
  | "gmail"
  | "calendar"
  | "drive"
  | "docs"
  | "sheets"
  | "bank"
  | "instagram"
  | "youtube";

type HubApp = {
  id: HubAppId;
  glyph: string;
  label: { en: string; fa: string };
  /** What this connection powers inside EchoMind — the "so what?". */
  powers: { en: string; fa: string };
  /** Shown when the state is needs_setup and the missing piece is server-side. */
  setupNote?: { en: string; fa: string };
  /** Connect action; undefined means no connect action for this state. */
  connectLabel?: { en: string; fa: string };
  onConnect?: () => Promise<{ authorization_url: string }>;
};

const STRINGS = {
  title: { en: "Your command centre", fa: "مرکز فرمان شما" },
  subtitle: {
    en: "Your apps orbit EchoMind. Tap one to see what it powers — nothing runs without your say-so.",
    fa: "برنامه‌های شما دور اکومایند می‌چرخند. روی یکی بزنید تا ببینید چه کاری برایتان می‌کند — هیچ کاری بدون اجازهٔ شما انجام نمی‌شود.",
  },
  connectedCount: {
    en: (n: number) => `${n} app${n === 1 ? "" : "s"} connected`,
    fa: (n: number) => `${n} برنامه متصل`,
  },
  refresh: { en: "Refresh", fa: "به‌روزرسانی" },
  connected: { en: "Connected", fa: "متصل" },
  notConnected: { en: "Not connected", fa: "متصل نیست" },
  needsSetup: { en: "Needs setup", fa: "نیاز به راه‌اندازی" },
  comingSoon: { en: "Coming soon", fa: "به‌زودی" },
  unknown: { en: "Sign in to see status", fa: "برای دیدن وضعیت وارد شوید" },
  connect: { en: "Connect", fa: "متصل کن" },
  requestAccess: { en: "Request access", fa: "درخواست دسترسی" },
  connecting: { en: "Opening…", fa: "در حال باز شدن…" },
  connectFailed: {
    en: "Could not open the sign-in page. Check your connection and try again.",
    fa: "صفحهٔ ورود باز نشد. اتصال را بررسی کنید و دوباره تلاش کنید.",
  },
  whatItPowers: { en: "What it powers", fa: "چه کاری برایتان می‌کند" },
  signInFirst: {
    en: "Sign in to EchoMind first, then connect your apps from here.",
    fa: "اول وارد اکومایند شوید، بعد برنامه‌هایتان را از همین‌جا وصل کنید.",
  },
} as const;

const APPS: HubApp[] = [
  {
    id: "gmail",
    glyph: "M",
    label: { en: "Gmail", fa: "جیمیل" },
    powers: {
      en: "Watches your inbox for train delays, refunds and renewals — and turns them into claims and follow-ups.",
      fa: "ایمیل‌های شما را برای تأخیر قطار، بازپرداخت و تمدید زیر نظر می‌گیرد و آن‌ها را به درخواست و پیگیری تبدیل می‌کند.",
    },
    setupNote: {
      en: "Google sign-in needs to be set up on the server first — then connect from here.",
      fa: "اول باید ورود با گوگل روی سرور راه‌اندازی شود — بعد از همین‌جا وصل کنید.",
    },
    connectLabel: STRINGS.connect,
    onConnect: () => startGoogleConnection("read"),
  },
  {
    id: "calendar",
    glyph: "31",
    label: { en: "Calendar", fa: "تقویم" },
    powers: {
      en: "Knows your journeys and deadlines, so Delay Repay claims and renewals never slip past their date.",
      fa: "سفرها و مهلت‌های شما را می‌داند، تا درخواست تأخیر قطار و تمدیدها از مهلتشان نگذرند.",
    },
    setupNote: {
      en: "Google sign-in needs to be set up on the server first — then connect from here.",
      fa: "اول باید ورود با گوگل روی سرور راه‌اندازی شود — بعد از همین‌جا وصل کنید.",
    },
    connectLabel: STRINGS.connect,
    onConnect: () => startGoogleConnection("read"),
  },
  {
    id: "drive",
    glyph: "D",
    label: { en: "Drive", fa: "درایو" },
    powers: {
      en: "Your tickets, receipts and documents, ready as evidence for claims and case files.",
      fa: "بلیت‌ها، رسیدها و مدارک شما، آماده به‌عنوان مدرک برای درخواست‌ها و پرونده‌ها.",
    },
    connectLabel: STRINGS.requestAccess,
    onConnect: () => startGoogleConnection("read", [GOOGLE_DRIVE_SCOPE]),
  },
  {
    id: "docs",
    glyph: "Doc",
    label: { en: "Docs", fa: "داکس" },
    powers: {
      en: "Claim letters and consumer-rights case files, drafted from your own evidence.",
      fa: "نامه‌های درخواست و پرونده‌های حقوق مصرف‌کننده، نوشته‌شده از روی مدارک خودتان.",
    },
    connectLabel: STRINGS.requestAccess,
    onConnect: () => startGoogleConnection("read", [GOOGLE_DOCS_SCOPE]),
  },
  {
    id: "sheets",
    glyph: "S",
    label: { en: "Sheets", fa: "شیت" },
    powers: {
      en: "Tracks refunds, claims and renewals in one place, so nothing is forgotten.",
      fa: "بازپرداخت‌ها، درخواست‌ها و تمدیدها را در یک جا دنبال می‌کند، تا چیزی فراموش نشود.",
    },
    connectLabel: STRINGS.requestAccess,
    onConnect: () => startGoogleConnection("read", [GOOGLE_SHEETS_SCOPE]),
  },
  {
    id: "bank",
    glyph: "£",
    label: { en: "Bank", fa: "بانک" },
    powers: {
      en: "Read-only: spots refunds, duplicate charges and renewal payments. EchoMind can never move money.",
      fa: "فقط خواندنی: بازپرداخت‌ها، برداشت‌های تکراری و پرداخت‌های تمدید را پیدا می‌کند. اکومایند هرگز نمی‌تواند پول جابه‌جا کند.",
    },
    setupNote: {
      en: "Needs a TrueLayer account on the server first — then you approve the bank's own consent screen.",
      fa: "اول باید حساب TrueLayer روی سرور راه‌اندازی شود — بعد شما صفحهٔ رضایت خود بانک را تأیید می‌کنید.",
    },
    connectLabel: STRINGS.connect,
    onConnect: () => startBankConnection(),
  },
  {
    id: "instagram",
    glyph: "Ig",
    label: { en: "Instagram", fa: "اینستاگرام" },
    powers: {
      en: "Your posts and reels, read-only — so EchoMind can help with your content and your channels.",
      fa: "پست‌ها و ریل‌های شما، فقط خواندنی — تا اکومایند در محتوا و کانال‌هایتان به شما کمک کند.",
    },
    setupNote: {
      en: "Needs a Meta app (client id and secret) on the server first.",
      fa: "اول باید یک برنامهٔ متا (شناسه و رمز کاربری) روی سرور راه‌اندازی شود.",
    },
    connectLabel: STRINGS.connect,
    onConnect: () => startInstagramConnection(),
  },
  {
    id: "youtube",
    glyph: "▶",
    label: { en: "YouTube", fa: "یوتیوب" },
    powers: {
      en: "Your channel and videos, read-only — so EchoMind can help with your channel.",
      fa: "کانال و ویدیوهای شما، فقط خواندنی — تا اکومایند در کانالتان به شما کمک کند.",
    },
    setupNote: {
      en: "Google sign-in needs to be set up on the server first — then connect from here.",
      fa: "اول باید ورود با گوگل روی سرور راه‌اندازی شود — بعد از همین‌جا وصل کنید.",
    },
    connectLabel: STRINGS.requestAccess,
    onConnect: () => startYouTubeConnection(),
  },
];

const COMING_SOON = [
  { glyph: "S", label: { en: "Slack", fa: "اسلک" } },
  { glyph: "N", label: { en: "Notion", fa: "نوشن" } },
] as const;

/** Orbit geometry: 8 nodes, clockwise from the top. */
const ANGLES = [-90, -45, 0, 45, 90, 135, 180, 225];
const ORBIT_RADIUS = 42; // percent of the container

function nodePosition(index: number): { x: number; y: number } {
  const radians = (ANGLES[index] * Math.PI) / 180;
  return {
    x: 50 + ORBIT_RADIUS * Math.cos(radians),
    y: 50 + ORBIT_RADIUS * Math.sin(radians),
  };
}

function stateLabel(state: HubState, lang: Lang): string {
  switch (state) {
    case "connected":
      return STRINGS.connected[lang];
    case "not_connected":
      return STRINGS.notConnected[lang];
    case "needs_setup":
      return STRINGS.needsSetup[lang];
    case "coming_soon":
      return STRINGS.comingSoon[lang];
    default:
      return STRINGS.unknown[lang];
  }
}

function stateTone(state: HubState): string {
  switch (state) {
    case "connected":
      return "bg-emerald-400/15 text-emerald-300 border-emerald-300/30";
    case "needs_setup":
      return "bg-amber-400/15 text-amber-300 border-amber-300/30";
    case "coming_soon":
      return "bg-slate-400/10 text-slate-400 border-slate-400/20";
    case "unknown":
      return "bg-slate-400/10 text-slate-400 border-slate-400/20";
    default:
      return "bg-sky-400/10 text-sky-300 border-sky-300/30";
  }
}

export default function HomeHub({ lang }: { lang: Lang }) {
  const [states, setStates] = useState<Record<HubAppId, HubState>>({
    gmail: "unknown",
    calendar: "unknown",
    drive: "unknown",
    docs: "unknown",
    sheets: "unknown",
    bank: "unknown",
    instagram: "unknown",
    youtube: "unknown",
  });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<HubAppId>("gmail");
  const [connectingId, setConnectingId] = useState<HubAppId | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const next: Record<HubAppId, HubState> = {
      gmail: "unknown",
      calendar: "unknown",
      drive: "unknown",
      docs: "unknown",
      sheets: "unknown",
      bank: "unknown",
      instagram: "unknown",
      youtube: "unknown",
    };

    // Google — one account, per-scope truth. Base connect grants Gmail +
    // Calendar; Drive/Docs/Sheets are extra scopes requested on demand.
    try {
      const google = await getGoogleConnectorStatus();
      if (!google.configured) {
        next.gmail = next.calendar = next.drive = next.docs = next.sheets = "needs_setup";
      } else if (!google.connected) {
        next.gmail = next.calendar = next.drive = next.docs = next.sheets = "not_connected";
      } else {
        next.gmail = google.scopes.includes(GOOGLE_GMAIL_SCOPE) ? "connected" : "not_connected";
        next.calendar = google.scopes.includes(GOOGLE_CALENDAR_SCOPE)
          ? "connected"
          : "not_connected";
        next.drive = google.scopes.includes(GOOGLE_DRIVE_SCOPE) ? "connected" : "needs_setup";
        next.docs = google.scopes.includes(GOOGLE_DOCS_SCOPE) ? "connected" : "needs_setup";
        next.sheets = google.scopes.includes(GOOGLE_SHEETS_SCOPE) ? "connected" : "needs_setup";
      }
    } catch {
      // Not signed in (or the backend is unreachable): stay "unknown",
      // which the UI explains as "sign in to see status". Never guess.
    }

    try {
      const bank = await getBankStatus();
      next.bank = !bank.configured ? "needs_setup" : bank.connected ? "connected" : "not_connected";
    } catch {
      // keep "unknown"
    }

    try {
      const instagram = await getInstagramStatus();
      next.instagram = !instagram.configured
        ? "needs_setup"
        : instagram.connected
          ? "connected"
          : "not_connected";
    } catch {
      // keep "unknown"
    }

    try {
      const youtube = await getYouTubeStatus();
      next.youtube = !youtube.configured
        ? "needs_setup"
        : youtube.connected
          ? "connected"
          : "not_connected";
    } catch {
      // keep "unknown"
    }

    setStates(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener("echomind-auth-ready", load);
    return () => {
      window.removeEventListener("echomind-auth-ready", load);
    };
  }, [load]);

  const connectedCount = APPS.filter((app) => states[app.id] === "connected").length;
  const selected = APPS.find((app) => app.id === selectedId) ?? APPS[0];
  const selectedState = states[selected.id];

  const handleConnect = async (app: HubApp) => {
    if (!app.onConnect) return;
    setConnectingId(app.id);
    setConnectError(null);
    try {
      const { authorization_url } = await app.onConnect();
      window.open(authorization_url, "_blank", "noopener");
      // Statuses refresh when the user returns; also re-check after a
      // short delay in case the OAuth tab completed quickly.
      window.setTimeout(() => void load(), 30_000);
    } catch (cause) {
      // Show the server's own reason (e.g. "not configured") when we
      // have it, instead of a generic message.
      const detail = cause instanceof Error && cause.message ? cause.message : null;
      setConnectError(detail ?? STRINGS.connectFailed[lang]);
    } finally {
      setConnectingId(null);
    }
  };

  // The Connect button is only offered when the tap can actually do
  // something: "not connected" for every app, plus Drive/Docs/Sheets
  // when only their scope is missing (the scope is requested from the
  // already-connected Google account). When the missing piece is
  // server-side (bank, Instagram, Google not configured at all), the
  // setup note above is the truth — no button that can only fail.
  const canConnect =
    selected.onConnect !== undefined &&
    selectedState !== "connected" &&
    selectedState !== "unknown" &&
    (selectedState === "not_connected" ||
      selected.id === "drive" ||
      selected.id === "docs" ||
      selected.id === "sheets");

  return (
    <section aria-label={STRINGS.title[lang]} className="w-full">
      <Reveal>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold leading-tight text-slate-50">{STRINGS.title[lang]}</h2>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-slate-400">
              {STRINGS.subtitle[lang]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="echomind-glass rounded-full px-3 py-1.5 text-xs font-semibold text-sky-200">
              {loading
                ? "…"
                : STRINGS.connectedCount[lang](connectedCount)}
            </span>
            <button
              type="button"
              onClick={() => void load()}
              className="echomind-glass rounded-full px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:text-slate-50"
            >
              {STRINGS.refresh[lang]}
            </button>
          </div>
        </div>
      </Reveal>

      {/* The orbit: EchoMind at the centre, apps around it on spokes. */}
      <Reveal delay={80}>
        <div
          className="relative mx-auto mt-6 aspect-square w-full max-w-[340px]"
          role="group"
          aria-label={STRINGS.title[lang]}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            className="absolute inset-0 h-full w-full"
          >
            <circle
              cx="50"
              cy="50"
              r={ORBIT_RADIUS}
              fill="none"
              stroke="rgba(125, 211, 252, 0.22)"
              strokeWidth="0.5"
              strokeDasharray="1.5 1.5"
            />
            {APPS.map((app, index) => {
              const { x, y } = nodePosition(index);
              return (
                <line
                  key={app.id}
                  x1="50"
                  y1="50"
                  x2={x}
                  y2={y}
                  stroke={
                    states[app.id] === "connected"
                      ? "rgba(52, 211, 153, 0.45)"
                      : "rgba(125, 211, 252, 0.25)"
                  }
                  strokeWidth="0.5"
                />
              );
            })}
          </svg>

          {/* Centre: EchoMind's own orb. */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <Orb3D size={96} />
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] font-bold tracking-wide text-slate-50">
              EchoMind
            </p>
          </div>

          {/* Orbiting apps. */}
          {APPS.map((app, index) => {
            const { x, y } = nodePosition(index);
            const state = states[app.id];
            const isSelected = app.id === selectedId;
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => {
                  setSelectedId(app.id);
                  setConnectError(null);
                }}
                aria-pressed={isSelected}
                aria-label={`${app.label[lang]} — ${stateLabel(state, lang)}`}
                className={`absolute flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full text-center transition ${
                  isSelected
                    ? "echomind-glass-strong scale-110"
                    : "echomind-glass hover:scale-105"
                }`}
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <span className="text-base font-bold leading-none text-slate-50">{app.glyph}</span>
                <span className="mt-0.5 max-w-[52px] truncate text-[9px] font-medium leading-none text-slate-300">
                  {app.label[lang]}
                </span>
                {state === "connected" ? (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -end-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-[11px] font-bold text-emerald-950"
                  >
                    ✓
                  </span>
                ) : state === "needs_setup" ? (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -end-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[11px] font-bold text-amber-950"
                  >
                    !
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </Reveal>

      {/* "So what?" — the selected app, and its connect action. */}
      <Reveal delay={140}>
        <GlassCard className="mt-4 p-4" strong>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-slate-50">{selected.label[lang]}</h3>
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${stateTone(selectedState)}`}
            >
              {stateLabel(selectedState, lang)}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300/80">
            {STRINGS.whatItPowers[lang]}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">{selected.powers[lang]}</p>
          {selectedState === "needs_setup" && selected.setupNote ? (
            <p className="mt-2 text-sm leading-relaxed text-amber-200/90">
              {selected.setupNote[lang]}
            </p>
          ) : null}
          {selectedState === "unknown" ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              {STRINGS.signInFirst[lang]}
            </p>
          ) : null}
          {canConnect ? (
            <div className="mt-3">
              <button
                type="button"
                disabled={connectingId === selected.id}
                onClick={() => void handleConnect(selected)}
                className="rounded-full bg-gradient-to-r from-sky-400 to-cyan-300 px-4 py-2 text-sm font-bold text-slate-950 transition disabled:opacity-60"
              >
                {connectingId === selected.id
                  ? STRINGS.connecting[lang]
                  : (selected.connectLabel?.[lang] ?? STRINGS.connect[lang])}
              </button>
              {selectedState === "needs_setup" && selected.id !== "bank" && selected.id !== "instagram" ? (
                <span className="ms-2 text-xs text-slate-400">
                  {lang === "fa"
                    ? "دسترسی با حساب گوگل شما درخواست می‌شود."
                    : "Requested with your Google account."}
                </span>
              ) : null}
            </div>
          ) : null}
          {connectError ? (
            <p role="alert" className="mt-2 text-sm text-rose-300">
              {connectError}
            </p>
          ) : null}
        </GlassCard>
      </Reveal>

      {/* Honest "coming soon": no connector exists, so no orbit node. */}
      <Reveal delay={180}>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {STRINGS.comingSoon[lang]}
          </span>
          {COMING_SOON.map((app) => (
            <span
              key={app.label.en}
              className="echomind-glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-400"
            >
              <span aria-hidden="true">{app.glyph}</span>
              {app.label[lang]}
              <span className="text-slate-500">· {STRINGS.comingSoon[lang]}</span>
            </span>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
