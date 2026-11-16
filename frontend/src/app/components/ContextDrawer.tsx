"use client";

import { useEffect, useState } from "react";

import ActiveContextBar, { type ContextWorkflow } from "./ActiveContextBar";
import Dashboard from "./Dashboard";
import PreferencesCard from "./PreferencesCard";
import { copy } from "../lib/copy";
import type { Locale } from "../lib/direction";
import type {
  AlertBundle,
  DocumentParseResponse,
  PillarId,
  Recommendation,
  UserPreferences,
} from "@/services/api";

type ContextTab = "context" | "tracking";

type ContextDrawerProps = {
  open: boolean;
  onClose: () => void;
  locale: Locale;
  workflow: ContextWorkflow;
  documentLabel?: string | null;
  memoryLabel?: string | null;
  onClear: () => void;
  bundle: AlertBundle | null;
  balance: string;
  threshold: string;
  onBalanceChange: (value: string) => void;
  onThresholdChange: (value: string) => void;
  onOpenPillar: (pillar: PillarId, doc?: DocumentParseResponse) => void;
  onRecommendation: (item: Recommendation) => void;
  preferences: UserPreferences;
  tagText: string;
  onSavePreferences: (prefs: UserPreferences, tags: string) => Promise<void>;
};

export default function ContextDrawer({
  open,
  onClose,
  locale,
  workflow,
  documentLabel,
  memoryLabel,
  onClear,
  bundle,
  balance,
  threshold,
  onBalanceChange,
  onThresholdChange,
  onOpenPillar,
  onRecommendation,
  preferences,
  tagText,
  onSavePreferences,
}: ContextDrawerProps) {
  const t = copy[locale];
  const [tab, setTab] = useState<ContextTab>("context");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const tabClass = (id: ContextTab) =>
    `min-h-11 flex-1 rounded-full px-3 text-sm font-semibold transition ${
      tab === id
        ? "bg-sky-400/15 text-sky-100"
        : "text-slate-400 hover:text-slate-200"
    }`;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        aria-label={t.contextClose}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t.contextOpen}
        className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[1.75rem] border border-metal-line bg-carbon shadow-lift sm:inset-y-0 sm:start-auto sm:end-0 sm:max-h-none sm:w-[26rem] sm:rounded-none sm:border-y-0 sm:border-s"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-metal-line px-4 py-3">
          <p className="text-sm font-semibold text-slate-100">{t.contextOpen}</p>
          <button
            type="button"
            className="min-h-11 rounded-full border border-metal-line px-3 text-xs font-semibold text-slate-300 hover:text-sky-200"
            onClick={onClose}
          >
            {t.contextClose}
          </button>
        </div>
        <div className="shrink-0 px-4 pt-3">
          <div className="flex rounded-full border border-metal-line bg-navy p-0.5">
            <button type="button" className={tabClass("context")} onClick={() => setTab("context")}>
              {t.contextTab}
            </button>
            <button type="button" className={tabClass("tracking")} onClick={() => setTab("tracking")}>
              {t.trackingTab}
            </button>
          </div>
        </div>
        <div className="echomind-scroll min-h-0 flex-1 px-4 py-4">
          {tab === "context" ? (
            <div className="flex flex-col gap-4">
              <ActiveContextBar
                compact
                locale={locale}
                workflow={workflow}
                documentLabel={documentLabel}
                memoryLabel={memoryLabel}
                onClear={onClear}
              />
              <PreferencesCard
                locale={locale}
                preferences={preferences}
                tags={tagText}
                onSave={onSavePreferences}
              />
            </div>
          ) : (
            <Dashboard
              locale={locale}
              bundle={bundle}
              balance={balance}
              threshold={threshold}
              onBalanceChange={onBalanceChange}
              onThresholdChange={onThresholdChange}
              onOpenPillar={(pillar, doc) => {
                onOpenPillar(pillar, doc);
                onClose();
              }}
              onRecommendation={(item) => {
                onRecommendation(item);
                onClose();
              }}
            />
          )}
        </div>
      </aside>
    </div>
  );
}
