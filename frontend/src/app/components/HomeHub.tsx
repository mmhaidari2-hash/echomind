"use client";

/**
 * HomeHub — the home screen IS the hub (mockup 3).
 *
 * The brand title sits ABOVE the golden living orb; the owner's apps
 * orbit it in a circle connected by spokes. No text is stamped across
 * the orb, and no truncated labels hang under the nodes — each node
 * is a crisp official brand SVG inside a glass circle. Tapping an app
 * answers "so what?" in the glass card below: its full name, live
 * sync status and a 1-tap OAuth Connect action.
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
 * Status revalidates itself (focus, visibility, interval, auth-ready)
 * — there is no manual Refresh button. The orb is alive: it breathes
 * when idle, ripples while the mic listens, spins its golden core
 * while EchoMind thinks, and pulses crisply while an action runs.
 *
 * The hub renders statically — no scroll-linked reveal
 * (IntersectionObserver / whileInView) and no 3D pointer parallax on
 * the orbit. Both used to gate the hub's visibility on scrolling, so
 * a fast scroll (or the mount-time auto-scroll) could leave the pill
 * or the top orbit nodes invisible while the ring and spokes were
 * already painted. The orbit is plain positioned buttons in a plain
 * div now: every node is painted on first paint and stays painted
 * while scrolling. The only motion left on the hub is state-driven
 * (orb states, the "so what?" crossfade on selection).
 *
 * Dark Obsidian design (obsidian, dark glass, Amber-Gold),
 * shadcn Button for the connect action.
 * Bilingual EN/FA; the orbit is symmetric so RTL needs no mirror.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion } from "framer-motion";

import { Browser } from "@capacitor/browser";

import { AnimatedCount, GlassCard, Kbd, LivingOrb, SpotlightCard, StatusDot, type OrbState } from "./Glass";
import { BrandIcon } from "./BrandIcons";
import { Button } from "./ui/button";
import { LISTEN_REQUEST, LISTEN_STOP_REQUEST } from "./NativeShell";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
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
  hubLabel: { en: "EchoMind hub", fa: "هاب اکومایند" },
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
  orbTap: { en: "Tap the orb to talk", fa: "برای صحبت روی دایره بزنید" },
  orbStop: {
    en: "Listening… tap the orb to stop",
    fa: "در حال شنیدن… برای توقف روی دایره بزنید",
  },
} as const;

/** Orbit geometry: 8 nodes, clockwise from the top. Radius 40 keeps
    the 56px nodes inside the container on a 360px viewport. */
const ANGLES = [-90, -45, 0, 45, 90, 135, 180, 225];
const ORBIT_RADIUS = 40; // percent of the container

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
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "needs_setup":
      return "bg-gold/15 text-gold border-gold/30";
    case "coming_soon":
      return "bg-white/[0.06] text-muted border-white/[0.09]";
    case "unknown":
      return "bg-white/[0.06] text-muted border-white/[0.09]";
    default:
      return "bg-gold/10 text-gold border-gold/30";
  }
}

export default function HomeHub({
  lang,
  thinking = false,
  executing = false,
}: {
  lang: Lang;
  /** EchoMind is composing a reply. */
  thinking?: boolean;
  /** A confirmed action is running. */
  executing?: boolean;
}) {
  const [states, setStates] = useState<Record<HubAppId, HubState>>(emptyHubStates);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<HubAppId>("gmail");
  const [connectingId, setConnectingId] = useState<HubAppId | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  /* Reduced motion skips the "so what?" crossfade (plain swap). The
     orbit itself has no pointer parallax: it is mouse-only, does
     nothing on the phone, and its 3D perspective context is what a
     mobile GPU can mis-cull while scrolling. */
  const reduceMotion = useReducedMotion();

  const load = useCallback(async () => {
    const { states: next, googleConfigured: configured } = await loadHubStatuses();
    setStates(next);
    setGoogleConfigured(configured);
    setLoading(false);
  }, []);

  /* No manual Refresh: status revalidates on mount, interval, focus,
     visibility and auth-ready. */
  useLiveRefresh(load, { intervalMs: 30_000 });

  /* The mic lives in the chat dock; it announces its state so the
     orb can ripple while listening. */
  useEffect(() => {
    const onListening = (event: Event) => {
      setListening(Boolean((event as CustomEvent<boolean>).detail));
    };
    window.addEventListener("echomind-listening", onListening);
    return () => window.removeEventListener("echomind-listening", onListening);
  }, []);

  /* Scroll-linked orbit rotation (round 3): as the hub scrolls
     through the viewport, the tick ring turns with it (up to 120°)
     — the rewarding scroll choreography, driven by the user's own
     scroll, not a timer. The ring is decorative only, so rotating it
     never detaches a spoke from a node. */
  const sectionRef = useRef<HTMLElement>(null);
  const ringRotate = useMotionValue(0);
  useEffect(() => {
    const section = sectionRef.current;
    const scroller = section?.closest(".echomind-scroll") as HTMLElement | null;
    if (!scroller || !section) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = section.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      const progress = Math.min(
        1,
        Math.max(0, (scrollerRect.bottom - rect.top) / (scrollerRect.height + rect.height)),
      );
      ringRotate.set(progress * 120);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ringRotate]);

  /** The orb IS a microphone (round 3): tapping it starts native
      listening through the same request the composer mic, the widget
      and the Speak action use; tapping again while listening stops
      it. Before this the orb was an aria-hidden div with no handler
      at all — the big golden "talk" button did nothing. */
  const handleOrbTap = useCallback(() => {
    window.dispatchEvent(new Event(listening ? LISTEN_STOP_REQUEST : LISTEN_REQUEST));
  }, [listening]);

  const orbState: OrbState = listening
    ? "listening"
    : executing
      ? "executing"
      : thinking
        ? "thinking"
        : "idle";

  const connectedCount = HUB_APPS.filter((app) => states[app.id] === "connected").length;
  const selected = HUB_APPS.find((app) => app.id === selectedId) ?? HUB_APPS[0];
  const selectedIndex = HUB_APPS.findIndex((app) => app.id === selected.id);
  const selectedState = states[selected.id];

  const handleConnect = async (app: HubApp) => {
    setConnectingId(app.id);
    setConnectError(null);
    try {
      const { authorization_url } = await startHubAppConnection(app);
      // Capacitor Browser (in-app tab), not window.open: opening the
      // OAuth page in the WebView itself would navigate the app away.
      await Browser.open({ url: authorization_url });
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
          <span className="echomind-num-mono text-xs text-gold">
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
      <div className="mt-3 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/[0.09] bg-white/[0.04] text-ink">
          <BrandIcon id={selected.icon} className="h-6 w-6" />
        </span>
        <h3 className="min-w-0 truncate text-base font-bold tracking-tight text-ink">{selected.label[lang]}</h3>
      </div>
      <p className="echomind-meta mt-3 text-gold">
        {STRINGS.whatItPowers[lang]}
      </p>
      <p className="mt-1 w-full min-w-0 text-sm leading-relaxed text-ink-soft [overflow-wrap:break-word]">{selected.powers[lang]}</p>
      {selectedState === "needs_setup" && selected.setupNote ? (
        <p className="mt-2 text-sm leading-relaxed text-gold">
          {selected.setupNote[lang]}
        </p>
      ) : null}
      {selectedState === "unknown" ? (
        <p className="mt-2 text-sm leading-relaxed text-muted">
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
            <span className="ms-2 text-xs text-muted">
              {lang === "fa"
                ? "دسترسی با حساب گوگل شما درخواست می‌شود."
                : "Requested with your Google account."}
            </span>
          ) : null}
        </div>
      ) : null}
      {connectError ? (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {connectError}
        </p>
      ) : null}
    </>
  );

  return (
    <section ref={sectionRef} aria-label={STRINGS.hubLabel[lang]} className="w-full overflow-visible">
      {/* Live count pill — the only header the hub needs. Rendered
          statically: a scroll-linked reveal could leave it invisible
          after a fast scroll. */}
      <div className="flex justify-center">
        <span className="echomind-glass rounded-full px-3 py-1.5 text-xs font-semibold text-gold">
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
      </div>

      {/* The orbit: the living orb at the centre, apps around it on
          spokes. Plain div, no entrance animation, no 3D perspective
          — every node is painted on first paint and stays painted
          while scrolling. The tick ring still turns slowly like a dial. */}
      <div
        className="relative mx-auto mt-2 aspect-square w-full max-w-[340px] overflow-visible"
        role="group"
        aria-label={STRINGS.hubLabel[lang]}
      >
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            {/* Precision tick ring (Linear-style instrument dial): 24
                ticks around the orbit, so the hub reads as an
                instrument, not a decoration. It turns with the
                user's scroll (see ringRotate above). */}
            <motion.g style={{ rotate: ringRotate, transformBox: "fill-box", transformOrigin: "center" }}>
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
                    stroke="rgba(255, 255, 255, 0.25)"
                    strokeWidth="0.4"
                  />
                );
              })}
            </motion.g>
            <circle
              cx="50"
              cy="50"
              r={ORBIT_RADIUS}
              fill="none"
              stroke="rgba(229, 169, 60, 0.35)"
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
                      ? "rgba(16, 185, 129, 0.5)"
                      : "rgba(229, 169, 60, 0.35)"
                  }
                  strokeWidth="0.5"
                />
              );
            })}
          </svg>

          {/* Centre: the living orb — a real button (round 3). Tapping
              it starts native listening, like the composer mic. No
              text stamped across it — the brand title sits above it
              in the hero. */}
          <button
            type="button"
            onClick={handleOrbTap}
            aria-label={listening ? STRINGS.orbStop[lang] : STRINGS.orbTap[lang]}
            aria-pressed={listening}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian active:brightness-110"
          >
            <LivingOrb size={150} state={orbState} />
          </button>

          {/* Orbiting apps — brand icons only, no labels. Raised
              beveled medallions (round 3), not flat glass circles:
              radial surface gradient, specular rim, amber glow. Plain
              positioned buttons with NO transition and no hover
              scale: a per-node animated transform is a compositing
              layer per node, and that is what a mobile GPU mis-culls
              while scrolling — the east / south-east nodes vanished
              on the phone while the ring and spokes painted. The
              selected node still reads as selected (gold medallion
              + static scale-110); nothing animates. */}
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
                className={`absolute flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ${
                  isSelected
                    ? "echomind-medallion-gold scale-110"
                    : "echomind-medallion"
                }`}
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <BrandIcon id={app.icon} className="h-6 w-6" />
                {state === "connected" ? (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -end-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white"
                  >
                    ✓
                  </span>
                ) : state === "needs_setup" ? (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -end-1 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-[11px] font-bold text-obsidian"
                  >
                    !
                  </span>
                ) : null}
              </button>
            );
          })}
      </div>

      {/* The orb is a microphone: a one-line teacher when idle, the
          listening state while recording. */}
      <p
        role="status"
        className={`mt-1 text-center text-[11px] font-semibold ${
          listening ? "text-gold" : "text-muted"
        }`}
      >
        {listening ? STRINGS.orbStop[lang] : STRINGS.orbTap[lang]}
      </p>

      {/* "So what?" — the selected app, and its connect action.
          Dense command-row layout (Raycast): object id + status dot
          on top, one-line powers, one action. Aceternity spotlight
          follows the pointer; a magicui border beam travels around
          the border; switching apps crossfades the content
          (framer-motion AnimatePresence, skipped on reduced motion).
          No scroll-linked reveal: the card is always painted. */}
      <div>
        <SpotlightCard className="mt-3 rounded-2xl">
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
      </div>

      {/* Honest "coming soon": no connector exists, so no orbit node.
          Rendered statically, like the rest of the hub. */}
      <div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="echomind-meta text-muted">
            {STRINGS.comingSoon[lang]}
          </span>
          {HUB_COMING_SOON.map((app) => (
            <span
              key={app.label.en}
              className="echomind-glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-muted"
            >
              <BrandIcon id={app.icon} className="h-4 w-4" />
              {app.label[lang]}
              <span className="text-muted">· {STRINGS.comingSoon[lang]}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
