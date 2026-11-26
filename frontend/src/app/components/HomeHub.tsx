"use client";

/**
 * HomeHub — the home screen IS the hub.
 *
 * EchoMind's orb at the centre, the owner's apps orbiting it in a circle
 * connected by spokes, a "N apps connected" pill at the top, green
 * checkmarks on the connected apps. Tapping an app answers "so what?" —
 * what that connection powers inside EchoMind.
 *
 * The app list and the status loading live in ./hubApps (shared with
 * the drawer hub), so both hubs always show the same 8 apps with the
 * same real states. Every state comes from a real status endpoint
 * (Google, Instagram, YouTube, Bank). Nothing is mocked: an app with
 * no connector, no keys, or no granted scope shows as "needs setup" /
 * "not connected" / "coming soon" — never a fake checkmark. Slack and
 * Notion have no connector, so they sit in the honest "coming soon"
 * strip, not in the orbit. Instagram here is EchoMind's own connector,
 * not Muse's.
 *
 * Warm editorial design (cream, dark brown, honey, Fraunces serif),
 * framer-motion entrance, shadcn Button for the connect action.
 * Bilingual EN/FA; the orbit is symmetric so RTL needs no mirror.
 */

import { useCallback, useEffect, useState, type PointerEvent } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";

import { AnimatedCount, GlassCard, Kbd, MotionReveal, Orb3D, Reveal, SpotlightCard, StatusDot } from "./Glass";
import { Button } from "./ui/button";
import {
  HUB_APPS,
  HUB_COMING_SOON,
  emptyHubStates,
  hubAppCanConnect,
  loadHubStatuses,
  startHubAppConnection,
  type HubApp,
  type HubAppId,
  type HubState,
} from "./hubApps";

type Lang = "en" | "fa";

const STRINGS = {
  title: { en: "Your command centre", fa: "مرکز فرمان شما" },
  subtitle: {
    en: "Your apps orbit EchoMind. Tap one to see what it powers — nothing runs without your say-so.",
    fa: "برنامه‌های شما دور اکومایند می‌چرخند. روی یکی بزنید تا ببینید چه کاری برایتان می‌کند — هیچ کاری بدون اجازهٔ شما انجام نمی‌شود.",
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
      return "bg-emerald-600/15 text-emerald-700 border-emerald-600/30";
    case "needs_setup":
      return "bg-honey/15 text-honey-deep border-honey/30";
    case "coming_soon":
      return "bg-bark/5 text-clay border-bark/10";
    case "unknown":
      return "bg-bark/5 text-clay border-bark/10";
    default:
      return "bg-honey/10 text-honey-deep border-honey/30";
  }
}

export default function HomeHub({ lang }: { lang: Lang }) {
  const [states, setStates] = useState<Record<HubAppId, HubState>>(emptyHubStates);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<HubAppId>("gmail");
  const [connectingId, setConnectingId] = useState<HubAppId | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  /* react-three-fiber pattern as CSS 3D — pointer parallax on the
     orbit: the whole scene leans a few degrees toward the pointer
     (mouse only), on springs. Reduced motion disables it. */
  const reduceMotion = useReducedMotion();
  const orbitRx = useMotionValue(0);
  const orbitRy = useMotionValue(0);
  const orbitSrx = useSpring(orbitRx, { stiffness: 140, damping: 20 });
  const orbitSry = useSpring(orbitRy, { stiffness: 140, damping: 20 });
  const handleOrbitMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || e.pointerType !== "mouse") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    const rtl = document.documentElement.dir === "rtl";
    orbitRx.set(-py * 4);
    orbitRy.set((rtl ? -1 : 1) * px * 4);
  };
  const resetOrbit = () => {
    orbitRx.set(0);
    orbitRy.set(0);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { states: next, googleConfigured: configured } = await loadHubStatuses();
    setStates(next);
    setGoogleConfigured(configured);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener("echomind-auth-ready", load);
    return () => {
      window.removeEventListener("echomind-auth-ready", load);
    };
  }, [load]);

  const connectedCount = HUB_APPS.filter((app) => states[app.id] === "connected").length;
  const selected = HUB_APPS.find((app) => app.id === selectedId) ?? HUB_APPS[0];
  const selectedIndex = HUB_APPS.findIndex((app) => app.id === selected.id);
  const selectedState = states[selected.id];

  const handleConnect = async (app: HubApp) => {
    setConnectingId(app.id);
    setConnectError(null);
    try {
      const { authorization_url } = await startHubAppConnection(app);
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

  const canConnect = hubAppCanConnect(selected, selectedState, googleConfigured);
  const connectLabel =
    selected.id === "drive" || selected.id === "docs" || selected.id === "sheets" || selected.id === "youtube"
      ? STRINGS.requestAccess[lang]
      : STRINGS.connect[lang];

  /** The "so what?" card body — extracted so AnimatePresence
      can crossfade it when the selected app changes. */
  const SoWhatContent = () => (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="echomind-num-mono text-xs text-honey-deep">
                  APP {String(selectedIndex + 1).padStart(2, "0")}
                </span>
                <StatusDot
                  tone={
                    selectedState === "connected"
                      ? "ok"
                      : selectedState === "needs_setup"
                        ? "warn"
                        : "idle"
                  }
                  label={stateLabel(selectedState, lang)}
                />
              </div>
              <span
                className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider ${stateTone(selectedState)}`}
              >
                {stateLabel(selectedState, lang)}
              </span>
            </div>
            <h3 className="mt-2 font-serif text-base font-semibold tracking-tight text-bark">{selected.label[lang]}</h3>
            <p className="echomind-meta mt-2 text-honey-deep">
              {STRINGS.whatItPowers[lang]}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-bark-soft">{selected.powers[lang]}</p>
            {selectedState === "needs_setup" && selected.setupNote ? (
              <p className="mt-2 text-sm leading-relaxed text-honey-deep">
                {selected.setupNote[lang]}
              </p>
            ) : null}
            {selectedState === "unknown" ? (
              <p className="mt-2 text-sm leading-relaxed text-clay">
                {STRINGS.signInFirst[lang]}
              </p>
            ) : null}
            {canConnect ? (
              <div className="mt-3 flex items-center gap-2">
                <Button
                  disabled={connectingId === selected.id}
                  onClick={() => void handleConnect(selected)}
                >
                  {connectingId === selected.id ? STRINGS.connecting[lang] : connectLabel}
                </Button>
                <Kbd>↵</Kbd>
                {selectedState === "needs_setup" && selected.id !== "bank" && selected.id !== "instagram" ? (
                  <span className="ms-2 text-xs text-clay">
                    {lang === "fa"
                      ? "دسترسی با حساب گوگل شما درخواست می‌شود."
                      : "Requested with your Google account."}
                  </span>
                ) : null}
              </div>
            ) : null}
            {connectError ? (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {connectError}
              </p>
            ) : null}
    </>
  );

  return (
    <section aria-label={STRINGS.title[lang]} className="w-full">
      <Reveal>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl font-semibold leading-[1.1] tracking-tight text-bark">{STRINGS.title[lang]}</h2>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-clay">
              {STRINGS.subtitle[lang]}
            </p>
            {/* Technical readout (Linear-style): Latin mono in both
                locales, like a device readout — counts, not prose.
                The connected count ticks up (magicui NumberTicker
                pattern) instead of snapping. */}
            <p className="echomind-meta mt-2 text-clay" aria-hidden="true">
              {String(HUB_APPS.length).padStart(2, "0")} APPS ·{" "}
              <AnimatedCount value={connectedCount} pad={2} /> CONNECTED · ORBIT 01
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="echomind-glass rounded-full px-3 py-1.5 text-xs font-semibold text-honey-deep">
              {loading ? (
                "…"
              ) : (
                <>
                  <AnimatedCount value={connectedCount} />{" "}
                  {lang === "fa"
                    ? "برنامه متصل"
                    : connectedCount === 1
                      ? "app connected"
                      : "apps connected"}
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => void load()}
              className="echomind-glass rounded-full px-3 py-1.5 text-xs font-semibold text-bark-soft transition hover:text-bark"
            >
              {STRINGS.refresh[lang]}
            </button>
          </div>
        </div>
      </Reveal>

      {/* The orbit: EchoMind at the centre, apps around it on spokes.
          Pointer parallax leans the scene toward the pointer (r3f
          pattern, CSS 3D); the tick ring turns slowly like a dial. */}
      <MotionReveal delay={80}>
        <motion.div
          className="relative mx-auto mt-6 aspect-square w-full max-w-[340px]"
          role="group"
          aria-label={STRINGS.title[lang]}
          style={{ rotateX: orbitSrx, rotateY: orbitSry, transformPerspective: 900 }}
          onPointerMove={handleOrbitMove}
          onPointerLeave={resetOrbit}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            className="absolute inset-0 h-full w-full"
          >
            {/* Precision tick ring (Linear-style instrument dial): 24
                ticks around the orbit, so the hub reads as an
                instrument, not a decoration. It turns slowly. */}
            <g className="echomind-orb-ring-spin">
              {Array.from({ length: 24 }, (_, i) => {
                const a = (i * 15 * Math.PI) / 180;
                const r1 = ORBIT_RADIUS + 2.5;
                const r2 = ORBIT_RADIUS + (i % 6 === 0 ? 4.5 : 3.5);
                return (
                  <line
                    key={i}
                    x1={50 + r1 * Math.cos(a)}
                    y1={50 + r1 * Math.sin(a)}
                    x2={50 + r2 * Math.cos(a)}
                    y2={50 + r2 * Math.sin(a)}
                    stroke="rgba(122, 90, 48, 0.4)"
                    strokeWidth="0.4"
                  />
                );
              })}
            </g>
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
                  stroke={
                    states[app.id] === "connected"
                      ? "rgba(5, 122, 85, 0.5)"
                      : "rgba(183, 121, 31, 0.3)"
                  }
                  strokeWidth="0.5"
                />
              );
            })}
          </svg>

          {/* Centre: EchoMind's own orb. */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <Orb3D size={96} />
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] font-bold tracking-wide text-bark">
              EchoMind
            </p>
          </div>

          {/* Orbiting apps. */}
          {HUB_APPS.map((app, index) => {
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
                <span className="text-base font-bold leading-none text-bark">{app.glyph}</span>
                <span className="mt-0.5 max-w-[52px] truncate font-mono text-[9px] font-semibold uppercase leading-none tracking-wider text-clay">
                  {app.label[lang]}
                </span>
                {state === "connected" ? (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -end-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-cream"
                  >
                    ✓
                  </span>
                ) : state === "needs_setup" ? (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -end-1 flex h-5 w-5 items-center justify-center rounded-full bg-honey text-[11px] font-bold text-cream"
                  >
                    !
                  </span>
                ) : null}
              </button>
            );
          })}
        </motion.div>
      </MotionReveal>

      {/* "So what?" — the selected app, and its connect action.
          Dense command-row layout (Raycast): object id + status dot
          on top, one-line powers, one action. Aceternity spotlight
          follows the pointer; a magicui border beam travels around
          the border; switching apps crossfades the content
          (framer-motion AnimatePresence, skipped on reduced motion). */}
      <MotionReveal delay={140}>
        <SpotlightCard className="mt-4 rounded-2xl">
          <GlassCard className="p-4" strong dense beam>
            {reduceMotion ? (
              <SoWhatContent />
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={selected.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  <SoWhatContent />
                </motion.div>
              </AnimatePresence>
            )}
          </GlassCard>
        </SpotlightCard>
      </MotionReveal>

      {/* Honest "coming soon": no connector exists, so no orbit node. */}
      <Reveal delay={180}>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="echomind-meta text-clay">
            {STRINGS.comingSoon[lang]}
          </span>
          {HUB_COMING_SOON.map((app) => (
            <span
              key={app.label.en}
              className="echomind-glass flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[11px] font-semibold text-clay"
            >
              <span aria-hidden="true">{app.glyph}</span>
              {app.label[lang]}
              <span className="text-clay">· {STRINGS.comingSoon[lang]}</span>
            </span>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
