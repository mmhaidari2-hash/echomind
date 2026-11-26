"use client";

import { copy } from "../lib/copy";
import type { Locale } from "../lib/direction";

export type ContextWorkflow =
  | "idle"
  | "delay_repay"
  | "consumer_rights"
  | "overdraft_shield"
  | "scan"
  | "travel";

type ActiveContextBarProps = {
  locale: Locale;
  workflow: ContextWorkflow;
  documentLabel?: string | null;
  memoryLabel?: string | null;
  onClear: () => void;
  compact?: boolean;
};

const WORKFLOW_COPY: Record<
  ContextWorkflow,
  "contextIdle" | "travel" | "rights" | "shield" | "actionScan" | "actionTravel"
> = {
  idle: "contextIdle",
  delay_repay: "travel",
  consumer_rights: "rights",
  overdraft_shield: "shield",
  scan: "actionScan",
  travel: "actionTravel",
};

export default function ActiveContextBar({
  locale,
  workflow,
  documentLabel,
  memoryLabel,
  onClear,
  compact = false,
}: ActiveContextBarProps) {
  const t = copy[locale];
  const active = workflow !== "idle" || Boolean(documentLabel);
  const workflowLabel = t[WORKFLOW_COPY[workflow]];

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        compact
          ? "rounded-3xl border border-metal-line bg-navy/90 px-4 py-3"
          : "border-b border-metal-line bg-navy/90 px-3 py-2.5 backdrop-blur-xl sm:px-4"
      }
    >
      <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-metal">
            {t.activeContext}
          </p>
          <p className="mt-1 truncate text-base font-medium text-bark">
            {workflowLabel}
            {documentLabel ? ` · ${documentLabel}` : ""}
          </p>
          {memoryLabel ? (
            <p className="mt-0.5 truncate text-sm text-clay">{memoryLabel}</p>
          ) : null}
        </div>
        {active ? (
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-full border border-metal-line px-3 py-1.5 text-xs font-semibold text-bark-soft transition hover:border-honey/40 hover:text-honey-deep"
            onClick={onClear}
          >
            {t.contextClear}
          </button>
        ) : null}
      </div>
    </div>
  );
}
