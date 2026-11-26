"use client";

/**
 * Shared glass/3D components — one design system for the mobile app and
 * the website. Copy-paste components in the shadcn-ui spirit: small,
 * owned by the repo, no new dependency. All of them are dir-neutral:
 * layout uses flex/grid and Tailwind logical utilities, so Persian RTL
 * works without a second layout.
 */

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

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
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300/80">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-bold leading-tight text-slate-50">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm leading-relaxed text-slate-400">{subtitle}</p> : null}
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
      className={`echomind-chip-glass flex min-h-11 items-center rounded-full px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 ${className}`}
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
      className={`echomind-chip-glass relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 ${
        active ? "border-rose-400/50 text-rose-300" : "text-slate-300 hover:text-sky-200"
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
