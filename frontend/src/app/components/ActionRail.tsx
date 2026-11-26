"use client";

import { copy } from "../lib/copy";
import type { Locale } from "../lib/direction";
import type { ContextWorkflow } from "./ActiveContextBar";
import { Reveal, Waterfall } from "./Glass";

type ActionRailProps = {
  locale: Locale;
  active: ContextWorkflow;
  onDelay: () => void;
  onShield: () => void;
  onScan: () => void;
  onRights: () => void;
  onTravel: () => void;
};

function RailIcon({ name }: { name: "delay" | "shield" | "scan" | "travel" }) {
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
  ];

  return (
    <section aria-label={t.subtitle} className="grid gap-3">
      <Waterfall>
        {actions.map((action, index) => {
          const selected = active === action.id;
          return (
            <Reveal key={action.id} delay={index * 70}>
              <button
                type="button"
                className={`flex min-h-[5.75rem] w-full flex-col items-start gap-3 rounded-[1.4rem] px-4 py-4 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-honey/60 ${
                  selected
                    ? "echomind-glass-strong echomind-tilt text-honey-deep"
                    : "echomind-glass echomind-tilt text-bark hover:border-honey/50"
                }`}
                onClick={action.onClick}
              >
                <span className="echomind-rail-icon flex h-11 w-11 items-center justify-center rounded-2xl">
                  <RailIcon name={action.icon} />
                </span>
                <span>
                  <span className="block font-serif text-lg font-semibold tracking-tight">{action.title}</span>
                  <span className="mt-1 block text-sm leading-5 text-clay">{action.hint}</span>
                </span>
              </button>
            </Reveal>
          );
        })}
      </Waterfall>
      <button
        type="button"
        className={`echomind-chip-glass min-h-11 justify-self-start rounded-full px-4 py-2 text-sm font-medium transition ${
          active === "consumer_rights" ? "text-honey-deep" : "text-bark-soft hover:text-honey-deep"
        }`}
        onClick={onRights}
      >
        {t.actionRights}
      </button>
    </section>
  );
}
