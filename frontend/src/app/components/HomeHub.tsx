"use client";

/**
 * HomeHub — the home screen IS the hub (mockup 3).
 *
 * The brand title sits ABOVE the golden living orb; the owner's apps
 * orbit it in a circle around the golden Saturn rings. No text is
 * stamped across the orb, and no truncated labels hang under the
 * nodes — each node is a crisp official brand SVG inside a glass
 * circle. Tapping an app
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
 * (IntersectionObserver / whileInView), no 3D pointer parallax, and
 * no scroll-linked ring rotation. All three used to gate or move the
 * hub's visibility on scrolling, and a mobile GPU mis-culled the
 * transformed layers while scrolling: Mahdi's round-3 screenshots
 * showed 4, then 4, then only 2 of the 8 orbit nodes painted, the
 * set changing with scroll position (pixel analysis: painted nodes
 * +33..+136 brightness vs background, absent nodes -19..+17 — the
 * absent ones were never painted at all, not dark or clipped). The
 * orbit is now plain positioned buttons in a plain div with NO
 * transforms at all (nodes are offset by calc() margins, the
 * selected node reads as selected through a static gold ring, the
 * tick ring is static): every node is painted on first paint and
 * stays painted while scrolling. The only motion left on the hub is
 * state-driven (orb states, the "so what?" crossfade on selection).
 *
 * The orb IS a microphone (round 3) and a HOLD-TO-TALK control
 * (round 4): press-and-hold it and it turns RED while recording;
 * releasing stops it and it goes back to gold. A quick tap also
 * starts listening, and the orb itself is the red STOP control.
 *
 * Dark Obsidian design (obsidian, dark glass, Amber-Gold),
 * shadcn Button for the connect action.
 * Bilingual EN/FA; the orbit is symmetric so RTL needs no mirror.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

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

/** A press held at least this long is a hold (release stops); a
    shorter press is a tap (listening continues until tapped again). */
const HOLD_MS = 300;

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
  orbTap: { en: "Hold the orb to talk", fa: "برای صحبت، دایره را نگه دارید" },
  orbStop: {
    en: "Listening… tap the orb to stop",
    fa: "در حال شنیدن… برای توقف روی دایره بزنید",
  },
  orbHoldStop: {
    en: "Recording — release to stop",
    fa: "در حال ضبط — برای توقف رها کنید",
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
  /** Whether the current session was started by a hold or a tap —
      the teacher line under the orb reads it. */
  const [listenMode, setListenMode] = useState<"hold" | "tap">("tap");
  /** True while the orb is physically held down — drives the red
      recording state immediately, before listening even starts. */
  const [orbPressed, setOrbPressed] = useState(false);
  const orbPressStartRef = useRef(0);
  const orbPressedRef = useRef(false);
  const orbPressHandledRef = useRef(0);
  const listeningRef = useRef(false);

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
     orb can ripple while listening. The event detail carries the
     listen mode (hold/tap) so the teacher line under the orb can say
     "release to stop" for a hold and "tap to stop" for a tap. */
  useEffect(() => {
    const onListening = (event: Event) => {
      const detail = (event as CustomEvent<{ listening?: boolean; mode?: "hold" | "tap" } | boolean>)
        .detail;
      if (typeof detail === "boolean") {
        setListening(detail);
        return;
      }
      setListening(Boolean(detail?.listening));
      if (detail?.mode === "hold" || detail?.mode === "tap") {
        setListenMode(detail.mode);
      }
    };
    window.addEventListener("echomind-listening", onListening);
    return () => window.removeEventListener("echomind-listening", onListening);
  }, []);

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  /** Hold-to-talk on the orb (round 4), exactly as Mahdi specified:
      press-and-hold starts listening and the orb turns RED while
      held; releasing stops it and it goes back to gold immediately.
      A quick tap also starts listening (tap mode) and the orb itself
      is the red STOP control. Stopping must ALWAYS work — releasing
      cancels even a start that is still pending (the hook's
      generation token makes that true; the stop request is honoured
      unconditionally there). */
  const onOrbPointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    orbPressHandledRef.current = Date.now();
    orbPressStartRef.current = Date.now();
    orbPressedRef.current = true;
    setOrbPressed(true);
    if (listeningRef.current) {
      // Tapping the orb while listening stops it.
      window.dispatchEvent(new Event(LISTEN_STOP_REQUEST));
      return;
    }
    setListenMode("hold");
    window.dispatchEvent(
      new CustomEvent(LISTEN_REQUEST, { detail: { mode: "hold" as const } }),
    );
  };

  const endOrbPress = () => {
    if (!orbPressedRef.current) return;
    orbPressedRef.current = false;
    setOrbPressed(false);
    const heldMs = Date.now() - orbPressStartRef.current;
    if (heldMs >= HOLD_MS) {
      // It was a hold: releasing stops listening.
      window.dispatchEvent(new Event(LISTEN_STOP_REQUEST));
      return;
    }
    // A quick tap: the session keeps listening in tap mode. Correct
    // the mode where the composer tracks it too: the request handler
    // sets its mode from every LISTEN_REQUEST and ignores the start
    // when one is already pending, so this only retargets the
    // teacher line from "release to stop" to "tap to stop".
    setListenMode("tap");
    window.dispatchEvent(
      new CustomEvent(LISTEN_REQUEST, { detail: { mode: "tap" as const } }),
    );
  };

  const onOrbClick = () => {
    // Pointer events already handled this press (touch/mouse). Only
    // a keyboard / assistive activation reaches here without one.
    if (Date.now() - orbPressHandledRef.current < 600) return;
    window.dispatchEvent(
      new Event(listening ? LISTEN_STOP_REQUEST : LISTEN_REQUEST),
    );
  };

  const orbState: OrbState =
    orbPressed || listening
      ? "recording"
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
    <section aria-label={STRINGS.hubLabel[lang]} className="w-full overflow-visible">
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
          the golden Saturn rings (round 7, mockup). Plain div, no
          entrance animation, no 3D perspective, no transforms, no
          scroll-linked rotation — every node is painted on first
          paint and stays painted while scrolling. No dashed circle,
          no spokes, no tick ring: only the nodes and the two smooth
          elliptical rings.
          Round 5: the container is its own compositing layer
          (translateZ(0)) so the compositor rasterizes the container
          and all 8 nodes atomically. On Mahdi's phone the round-4
          build still dropped exactly Drive/Docs/Sheets/Bank (the
          right + bottom nodes) while the ring and spokes painted —
          and the node buttons were already maximally plain (no
          transform, no transition, no animation, no filter), with
          correct geometry headlessly at 360/412px. The failure could
          NOT be reproduced in staging, so this is a targeted
          hardening for the Android WebView raster path, not a proven
          fix: the phone test is still the gate. */}
      <div
        className="relative mx-auto mt-2 aspect-square w-full max-w-[340px] overflow-visible [transform:translateZ(0)]"
        role="group"
        aria-label={STRINGS.hubLabel[lang]}
      >
          {/* Back ring (round 7, mockup 18112_24_qs19.jpg): a smooth
              golden ellipse behind the orb — the Saturn ring passing
              behind the top of the sphere. SVG geometry, not a CSS
              transform, and fully static: no rotation, no animation.
              The tick ring, the dashed circle and the straight spokes
              are GONE (Mahdi: «خطای دورشو پاک کن، فقط اپا دورش
              باشه») — only the app nodes orbit the orb now, on these
              rings. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          >
            <defs>
              <linearGradient
                id="echomind-ring-gold"
                x1="0"
                y1="0"
                x2="1"
                y2="1"
              >
                <stop offset="0%" stopColor="#f6d789" />
                <stop offset="45%" stopColor="#e5a93c" />
                <stop offset="100%" stopColor="#9a6b1f" />
              </linearGradient>
            </defs>
            <ellipse
              cx="50"
              cy="50"
              rx="47"
              ry="15"
              fill="none"
              stroke="url(#echomind-ring-gold)"
              strokeWidth="2.4"
              opacity="0.16"
              transform="rotate(-18 50 50)"
            />
            <ellipse
              cx="50"
              cy="50"
              rx="47"
              ry="15"
              fill="none"
              stroke="url(#echomind-ring-gold)"
              strokeWidth="0.9"
              opacity="0.85"
              transform="rotate(-18 50 50)"
            />
          </svg>

          {/* Centre: the living orb — a real button (round 3), a
              hold-to-talk control (round 4). Press-and-hold: RED
              while recording, gold again on release. Quick tap:
              starts listening; tap again to stop. No text stamped
              across it — the brand title sits above it in the hero.
              Centred with margins, not transforms: a -translate
              centring is a transform layer the mobile GPU can
              mis-cull, same failure as the orbit nodes. */}
          <button
            type="button"
            onPointerDown={onOrbPointerDown}
            onPointerUp={endOrbPress}
            onPointerCancel={endOrbPress}
            onPointerLeave={endOrbPress}
            onClick={onOrbClick}
            onContextMenu={(event) => event.preventDefault()}
            aria-label={listening ? STRINGS.orbStop[lang] : STRINGS.orbTap[lang]}
            aria-pressed={listening}
            className="absolute left-1/2 top-1/2 cursor-pointer touch-none select-none rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian active:brightness-110"
            style={{ marginLeft: -75, marginTop: -75 }}
          >
            <LivingOrb size={150} state={orbState} />
          </button>

          {/* Front band (round 7, mockup): the near side of the Saturn
              ring — one shallow golden arc sweeping across the LOWER
              third of the orb, in front of it. A separate SVG above
              the orb button (the back ellipse above is below it), so
              the ring reads as passing behind the top and in front
              of the bottom. pointer-events none: it never blocks the
              orb press. The nodes below paint above it. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          >
            <path
              d="M 4 54 A 46 12 -12 0 1 96 46"
              fill="none"
              stroke="url(#echomind-ring-gold)"
              strokeWidth="3"
              opacity="0.18"
              strokeLinecap="round"
            />
            <path
              d="M 4 54 A 46 12 -12 0 1 96 46"
              fill="none"
              stroke="url(#echomind-ring-gold)"
              strokeWidth="1.4"
              opacity="0.9"
              strokeLinecap="round"
            />
          </svg>

          {/* Orbiting apps — brand icons only, no labels. Raised
              beveled medallions (round 3), not flat glass circles:
              radial surface gradient, specular rim, amber glow. Plain
              positioned buttons with NO transform and no transition:
              nodes used to be centred with -translate-x/y and the
              selected one scaled to 110% — each a compositing layer
              a mobile GPU mis-culls while scrolling, so nodes
              vanished on the phone (4, then 4, then 2 of 8 in
              Mahdi's round-3 screenshots). Centring is now a calc()
              margin (56px node → 28px half) and the selected node
              reads as selected through a static gold ring
              (.echomind-node-selected). Nothing animates.
              Round 5: the round-4 build STILL dropped Drive/Docs/
              Sheets/Bank on Mahdi's phone (18:19 screenshots) even
              though these buttons carry no transform, no transition,
              no animation and no filter, and headless probes show
              all 8 painted at 360/412px at every scroll position.
              No further class can be removed from the buttons — the
              remaining hardening is the translateZ(0) layer on the
              orbit container above. Phone confirmation is the gate. */}
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
                className={`absolute flex h-14 w-14 items-center justify-center rounded-full ${
                  isSelected
                    ? "echomind-medallion-gold echomind-node-selected"
                    : "echomind-medallion"
                }`}
                style={{ left: `calc(${x}% - 28px)`, top: `calc(${y}% - 28px)` }}
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
          listening state while recording — "release to stop" for a
          hold, "tap to stop" for a tap. */}
      <p
        role="status"
        className={`mt-1 text-center text-[11px] font-semibold ${
          listening ? "text-gold" : "text-muted"
        }`}
      >
        {listening
          ? listenMode === "hold"
            ? STRINGS.orbHoldStop[lang]
            : STRINGS.orbStop[lang]
          : STRINGS.orbTap[lang]}
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
