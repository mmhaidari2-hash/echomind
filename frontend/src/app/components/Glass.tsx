"use client";

/**
 * Shared components — EchoMind's own design system. The blend:
 * Dark Obsidian base (obsidian, dark glass, Amber-Gold) +
 * Linear's precision (hairlines, tabular numbers, tight motion) +
 * Raycast's speed (dense command rows, kbd hints) + Vercel/Arc-style
 * bold typography (one accent, mono technical labels, tight-tracked
 * display type). Copy-paste components in the shadcn-ui spirit:
 * small, owned by the repo — the real shadcn components live in
 * ./ui/ (Button, Card). Motion is real framer-motion
 * (MotionReveal), not CSS imitations. All of them are dir-neutral:
 * layout uses flex/grid and Tailwind logical utilities, so Persian RTL
 * works without a second layout.
 */

import { useEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useSpring } from "framer-motion";

export function GlassCard({
  children,
  className = "",
  strong = false,
  tilt = false,
  dense = false,
  beam = false,
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
  tilt?: boolean;
  /** Dense (Linear-style): smaller radius, hairline border, quiet shadow. */
  dense?: boolean;
  /** magicui BorderBeam: a gold beam travelling around the border. */
  beam?: boolean;
}) {
  const classes = [
    strong ? "echomind-glass-strong" : "echomind-glass",
    dense ? "rounded-2xl" : "rounded-[1.4rem]",
    tilt ? "echomind-tilt" : "",
    beam ? "echomind-beam" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <div className={classes}>{children}</div>;
}

/** magicui NumberTicker pattern, on a framer-motion spring — a count
    that ticks up to its value (e.g. "02 CONNECTED"). Latin digits in
    mono; Persian labels around it stay plain semibold. Reduced motion
    jumps straight to the final value. Written via a ref so the
    animation never re-renders the component. */
export function AnimatedCount({
  value,
  pad = 0,
  className = "",
}: {
  value: number;
  pad?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(0);
  const format = (v: number) => String(Math.round(v)).padStart(pad, "0");
  useMotionValueEvent(mv, "change", (v) => {
    if (ref.current) ref.current.textContent = format(v);
  });
  useEffect(() => {
    if (reduceMotion) {
      mv.set(value);
      if (ref.current) ref.current.textContent = format(value);
      return;
    }
    const controls = animate(mv, value, { type: "spring", stiffness: 90, damping: 20 });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, mv, reduceMotion]);
  return (
    <span ref={ref} className={className}>
      {format(0)}
    </span>
  );
}

/** Aceternity Spotlight pattern — a soft gold glow that follows the
    pointer across the card. Position is written to CSS vars on the
    element (no React re-render per move); the glow itself is pure
    CSS (::after, see .echomind-spotlight). */
export function SpotlightCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  };
  return (
    <div ref={ref} onPointerMove={handleMove} className={`echomind-spotlight ${className}`}>
      {children}
    </div>
  );
}

/** Aceternity 3D Card pattern, on framer-motion springs — the card
    tilts toward the pointer (mouse only, ±6°) and springs back on
    leave. RTL mirrors the yaw so the tilt follows the pointer in
    both directions. Reduced motion renders a plain div. */
export function TiltCard({
  children,
  className = "",
  max = 6,
}: {
  children: ReactNode;
  className?: string;
  /** Maximum tilt in degrees. */
  max?: number;
}) {
  const reduceMotion = useReducedMotion();
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 200, damping: 18 });
  const sry = useSpring(ry, { stiffness: 200, damping: 18 });
  if (reduceMotion) return <div className={className}>{children}</div>;
  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    const rtl = document.documentElement.dir === "rtl";
    rx.set(-py * max);
    ry.set((rtl ? -1 : 1) * px * max);
  };
  const reset = () => {
    rx.set(0);
    ry.set(0);
  };
  return (
    <motion.div
      className={className}
      style={{ rotateX: srx, rotateY: sry, transformPerspective: 900, transformStyle: "preserve-3d" }}
      onPointerMove={handleMove}
      onPointerLeave={reset}
    >
      {children}
    </motion.div>
  );
}

/** Raycast kbd chip — the keyboard-first hint (⌘K, ↵, P, C, F). */
export function Kbd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <kbd className={`echomind-kbd ${className}`}>{children}</kbd>;
}

/** Precise status dot + mono label (Linear-style object status). */
export function StatusDot({
  tone,
  label,
  className = "",
}: {
  tone: "ok" | "warn" | "idle";
  label: string;
  className?: string;
}) {
  const dot =
    tone === "ok"
      ? "bg-emerald-600"
      : tone === "warn"
        ? "bg-gold"
        : "bg-white/30";
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      {/* Plain semibold label (not mono): the label is a localised
          sentence in Persian too, and mono tracking would disconnect
          joined letters. Mono stays on Latin technical readouts. */}
      <span className="text-[11px] font-semibold text-muted">{label}</span>
    </span>
  );
}

/** Raycast-style dense command row — icon tile, title + one-line meta,
    trailing kbd or chevron, hairline divider. The fast surface: one
    row, one job, one keypress. */
export function CommandRow({
  icon,
  title,
  meta,
  trailing,
  selected = false,
  onClick,
  ariaLabel,
}: {
  icon: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected || undefined}
      aria-label={ariaLabel}
      className="echomind-row relative"
    >
      {/* framer-motion layout animation: one shared gold bar that
          glides between rows when the selection moves, instead of
          jumping. The static inset shadow in CSS is gone. */}
      {selected ? (
        <motion.span
          layoutId="echomind-rail-selected"
          aria-hidden="true"
          className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-gold"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      ) : null}
      <span className="echomind-rail-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl [&_svg]:h-5 [&_svg]:w-5">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-5 tracking-tight text-ink">
          {title}
        </span>
        {meta ? (
          <span className="mt-0.5 block truncate text-[13px] leading-4 text-muted">{meta}</span>
        ) : null}
      </span>
      {trailing ? <span className="flex shrink-0 items-center gap-1.5">{trailing}</span> : null}
    </button>
  );
}

export type OrbState = "idle" | "listening" | "thinking" | "executing";

/** The living orb — a 3D volumetric sphere from layered radial
    shaders (no 3D library): specular highlight, molten gold core,
    deep obsidian base, ambient glow. No text is ever stamped across
    it — the brand title sits above it. States animate on
    transform/opacity only, so the phone holds 60fps:
    idle = slow breathing, listening = gold ripple rings,
    thinking = rotating golden core, executing = crisp pulse. */
export function LivingOrb({
  size = 180,
  state = "idle",
  className = "",
}: {
  size?: number;
  state?: OrbState;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      data-state={state}
      className={`echomind-living-orb ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Legacy alias — the old flat orb now renders the living orb. */
export function Orb3D({ size = 180, className = "" }: { size?: number; className?: string }) {
  return <LivingOrb size={size} state="idle" className={className} />;
}

/** Spring-physics staggered cascade reveal — 40ms per item, once on
    mount (or on tab switch when the key changes). Transform/opacity
    only; reduced motion renders the children statically. */
export function Cascade({
  children,
  className = "",
  staggerMs = 40,
}: {
  children: ReactNode;
  className?: string;
  staggerMs?: number;
}) {
  const reduceMotion = useReducedMotion();
  const items = Array.isArray(children) ? children : [children];
  if (reduceMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: staggerMs / 1000 } },
      }}
    >
      {items.map((child, index) => (
        <motion.div
          key={index}
          variants={{
            hidden: { opacity: 0, y: 14 },
            show: {
              opacity: 1,
              y: 0,
              transition: { type: "spring", stiffness: 260, damping: 26 },
            },
          }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

/** Reveal on scroll: adds .is-visible when the element enters view. */
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      node.classList.add("is-visible");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const style = { "--reveal-delay": `${delay}ms` } as CSSProperties;
  return (
    <div ref={ref} style={style} className={`echomind-reveal ${className}`}>
      {children}
    </div>
  );
}

/** Reveal on scroll: real framer-motion entrance (fade + rise, with a
    stagger delay). Linear-quick: 0.5s, 14px — precise, never floaty.
    Falls back to no animation when the user prefers reduced motion.
    Replaces the old CSS-only Reveal for the surfaces that need to
    feel alive — the waterfall cards and the hub. */
export function MotionReveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{
        duration: 0.5,
        delay: delay / 1000,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

/** Waterfall (masonry) feed — the cascading scroll. */
export function Waterfall({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`echomind-waterfall ${className}`}>{children}</div>;
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      {/* Mono eyebrow (Vercel-style technical label) + tight-tracked
          bold title (Arc-style hierarchy): one accent, no decoration. */}
      <p className="echomind-meta text-gold">{eyebrow}</p>
      <h2 className="mt-1.5 font-sans text-2xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-3xl">{title}</h2>
      {subtitle ? <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{subtitle}</p> : null}
    </div>
  );
}

/** Aurora backdrop for the home shell: soft light behind the whole
    app. Rendered once inside the app root, above the canvas colour,
    below the scroll content. */
export function AuroraBackground() {
  return <div aria-hidden="true" className="echomind-aurora" />;
}

/** Glass pill button — the header controls (context, language, auth).
    Passes all button props through; only the surface is owned here. */
export function GlassPill({
  children,
  className = "",
  ...props
}: {
  children: ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`echomind-chip-glass flex min-h-11 items-center rounded-full px-3 py-1.5 text-xs font-semibold text-ink-soft hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** Glass icon button — the composer controls (attach, mic, menu).
    `active` gives it the recording/selected tint. */
export function GlassIconButton({
  children,
  className = "",
  active = false,
  ...props
}: {
  children: ReactNode;
  className?: string;
  active?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`echomind-chip-glass relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${
        active ? "border-red-500/40 text-red-300" : "text-ink-soft hover:text-gold"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** Hero orb: the living sphere with a slow float, for the welcome
    heading. Decorative only (aria-hidden). */
export function HeroOrb({ size = 150, state = "idle", className = "" }: { size?: number; state?: OrbState; className?: string }) {
  return (
    <div aria-hidden="true" className={`echomind-orb-float pointer-events-none ${className}`}>
      <LivingOrb size={size} state={state} />
    </div>
  );
}
