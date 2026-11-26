"use client";

/**
 * Shared glass/3D components — one design system for the mobile app and
 * the website. Warm editorial language (cream, dark brown, honey,
 * Fraunces serif). Copy-paste components in the shadcn-ui spirit:
 * small, owned by the repo — the real shadcn components live in
 * ./ui/ (Button, Card). Motion is real framer-motion
 * (MotionReveal), not CSS imitations. All of them are dir-neutral:
 * layout uses flex/grid and Tailwind logical utilities, so Persian RTL
 * works without a second layout.
 */

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

export function GlassCard({
  children,
  className = "",
  strong = false,
  tilt = false,
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
  tilt?: boolean;
}) {
  const classes = [
    strong ? "echomind-glass-strong" : "echomind-glass",
    "rounded-[1.4rem]",
    tilt ? "echomind-tilt" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <div className={classes}>{children}</div>;
}

export function Orb3D({ size = 180, className = "" }: { size?: number; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`echomind-orb-3d ${className}`}
      style={{ width: size, height: size }}
    />
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
    stagger delay). Falls back to no animation when the user prefers
    reduced motion. Replaces the old CSS-only Reveal for the surfaces
    that need to feel alive — the waterfall cards and the hub. */
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
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{
        duration: 0.65,
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
      <p className="spark-eyebrow">{eyebrow}</p>
      <h2 className="mt-1 font-serif text-2xl font-semibold leading-tight text-bark sm:text-3xl">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm leading-relaxed text-clay">{subtitle}</p> : null}
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
      className={`echomind-chip-glass flex min-h-11 items-center rounded-full px-3 py-1.5 text-xs font-semibold text-bark-soft hover:text-honey-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-honey/60 ${className}`}
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
      className={`echomind-chip-glass relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-honey/60 ${
        active ? "border-red-700/40 text-red-700" : "text-bark-soft hover:text-honey-deep"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** Hero orb: the 3D glass sphere with a slow float, for the welcome
    heading. Decorative only (aria-hidden). */
export function HeroOrb({ size = 150, className = "" }: { size?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`echomind-orb-float pointer-events-none ${className}`}>
      <Orb3D size={size} />
    </div>
  );
}
