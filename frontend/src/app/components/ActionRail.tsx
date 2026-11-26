"use client";

import { copy } from "../lib/copy";
import type { Locale } from "../lib/direction";
import type { ContextWorkflow } from "./ActiveContextBar";
import { Cascade, GlassCard } from "./Glass";

type ActionRailProps = {
  locale: Locale;
  active: ContextWorkflow;
  onDelay: () => void;
  onShield: () => void;
  onScan: () => void;
  onRights: () => void;
  onTravel: () => void;
};

/* The action waterfall (mockup 1): large glass cards, big title +
   one-line hint, alternating left/right offsets so the feed falls
   like a waterfall, cascading in with a 40ms stagger on mount. No
   dense rows, no kbd chips — the cards ARE the surface. */
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
      onClick: onDelay,
    },
    {
      id: "travel" as const,
      title: t.actionTravel,
      hint: t.actionHintTravel,
      onClick: onTravel,
    },
    {
      id: "overdraft_shield" as const,
      title: t.actionShield,
      hint: t.actionHintShield,
      onClick: onShield,
    },
    {
      id: "scan" as const,
      title: t.actionScan,
      hint: t.actionHintScan,
      onClick: onScan,
    },
    {
      id: "consumer_rights" as const,
      title: t.actionRights,
      hint: t.actionHintRights,
      onClick: onRights,
    },
  ];

  return (
    <section aria-label={t.subtitle} className="w-full">
      <Cascade className="echomind-waterfall-offset grid gap-3" staggerMs={40}>
        {actions.map((action) => {
          const isActive = active === action.id;
          return (
            <button
              key={action.id}
              type="button"
              onClick={action.onClick}
              aria-current={isActive || undefined}
              aria-label={action.title}
              className="w-full text-start"
            >
              <GlassCard
                className={`flex items-center justify-between gap-3 rounded-[1.6rem] px-5 py-5 transition ${
                  isActive ? "border-gold/60 bg-gold/[0.08]" : "hover:border-gold/40"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-xl font-bold tracking-tight text-ink">
                    {action.title}
                  </span>
                  <span className="mt-1 block truncate text-sm text-muted">{action.hint}</span>
                </span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                  className="h-5 w-5 shrink-0 text-gold"
                >
                  <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </GlassCard>
            </button>
          );
        })}
      </Cascade>
    </section>
  );
}
