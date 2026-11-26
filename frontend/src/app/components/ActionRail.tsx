"use client";

import { copy } from "../lib/copy";
import type { Locale } from "../lib/direction";
import type { ContextWorkflow } from "./ActiveContextBar";
import { CommandRow, GlassCard, Kbd, MotionReveal } from "./Glass";

type ActionRailProps = {
  locale: Locale;
  active: ContextWorkflow;
  onDelay: () => void;
  onShield: () => void;
  onScan: () => void;
  onRights: () => void;
  onTravel: () => void;
};

function RailIcon({ name }: { name: "delay" | "shield" | "scan" | "travel" | "rights" }) {
  const common = "h-6 w-6";
  if (name === "delay") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
        <path
          d="M3.5 12.5 21 4.8l-4.2 15.2-4.3-5.2-5.5 2.2 1.2-5.3Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "travel") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
        <path
          d="M4 16.5 20 9l-2.2 8.2-3.4-3.1-3.8 1.6.8-3.8Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M7 19h10"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (name === "shield") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
        <path
          d="M12 3.8 19 6.5v5.2c0 4.3-2.9 7.4-7 8.5-4.1-1.1-7-4.2-7-8.5V6.5L12 3.8Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "rights") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
        <path
          d="M7 3.5h7l4 4v13H7V3.5Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="m10 13 2 2 3.5-4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
      <path
        d="M8.2 7.2 9 5.5h6l.8 1.7H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.2Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.1" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export default function ActionRail({
  locale,
  active,
  onDelay,
  onShield,
  onScan,
  onRights,
  onTravel,
}: ActionRailProps) {
  const t = copy[locale];
  const actions = [
    {
      id: "delay_repay" as const,
      title: t.actionDelay,
      hint: t.actionHintDelay,
      icon: "delay" as const,
      onClick: onDelay,
    },
    {
      id: "travel" as const,
      title: t.actionTravel,
      hint: t.actionHintTravel,
      icon: "travel" as const,
      onClick: onTravel,
    },
    {
      id: "overdraft_shield" as const,
      title: t.actionShield,
      hint: t.actionHintShield,
      icon: "shield" as const,
      onClick: onShield,
    },
    {
      id: "scan" as const,
      title: t.actionScan,
      hint: t.actionHintScan,
      icon: "scan" as const,
      onClick: onScan,
    },
    {
      id: "consumer_rights" as const,
      title: t.actionRights,
      hint: t.actionHintRights,
      icon: "rights" as const,
      onClick: onRights,
    },
  ];

  /* Dense command list (Raycast) instead of four big cards: one
     glass slab, hairline rows, one job per row, ↵ to run it. The
     waterfall stays on the website sections; the rail is the fast
     surface, so it is dense. All five actions, all strings kept. */
  return (
    <section aria-label={t.subtitle} className="grid gap-3">
      <MotionReveal>
        <GlassCard dense className="echomind-command-list px-3 py-1">
          {actions.map((action) => (
            <CommandRow
              key={action.id}
              icon={<RailIcon name={action.icon} />}
              title={action.title}
              meta={action.hint}
              selected={active === action.id}
              onClick={action.onClick}
              ariaLabel={action.title}
              trailing={<Kbd>↵</Kbd>}
            />
          ))}
        </GlassCard>
      </MotionReveal>
    </section>
  );
}
