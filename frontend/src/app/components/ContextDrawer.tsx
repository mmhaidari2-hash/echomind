"use client";

import { useEffect, useState } from "react";

import ActiveContextBar, { type ContextWorkflow } from "./ActiveContextBar";
import Dashboard from "./Dashboard";
import PreferencesCard from "./PreferencesCard";
import LifeSummaryCard from "./LifeSummaryCard";
import ConnectionsHub from "./ConnectionsHub";
import GoogleConnectionsCard from "./GoogleConnectionsCard";
import ProvidersPanel from "./ProvidersPanel";
import HubStatus from "./HubStatus";
import { copy } from "../lib/copy";
import type { Locale } from "../lib/direction";
import type {
  AlertBundle,
  DocumentParseResponse,
  PillarId,
  Recommendation,
  LifeSnapshot,
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
  lifeSnapshot: LifeSnapshot | null;
  onLifeChanged: () => Promise<void>;
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
  lifeSnapshot,
  onLifeChanged,
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
        ? "echomind-gold-btn"
        : "text-muted hover:text-ink-soft"
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
        className="echomind-glass-blur absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom,0px),48px)] flex max-h-[88dvh] flex-col rounded-t-[1.75rem] shadow-lift sm:inset-y-0 sm:start-auto sm:end-0 sm:max-h-none sm:w-[26rem] sm:rounded-none sm:border-y-0 sm:border-s"
      >
        {/* The sheet floats 48px above the viewport bottom (round 3):
            on an Android WebView env(safe-area-inset-bottom) is 0 and
            Samsung's 3-button bar is ~48px tall, so a bottom-0 sheet
            sits behind it — the BALANCE GUARD inputs were cut off
            there even though the inner scroll area had 80px of
            padding. Lifting the whole sheet makes the cut impossible
            by construction; the inner safe padding stays as well. */}
        {/* Drag handle (mockup 2). */}
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/25 sm:hidden" />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.09] px-4 py-3">
          <p className="min-w-0 flex-1 truncate font-sans text-sm font-semibold text-ink">{t.contextOpen}</p>
          <button
            type="button"
            className="min-h-[44px] rounded-full border border-gold/60 px-4 text-xs font-bold text-gold transition hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            onClick={onClose}
          >
            {t.contextClose}
          </button>
        </div>
        <div className="shrink-0 px-4 pt-3">
          <div className="flex min-w-0 rounded-full border border-white/[0.09] bg-white/[0.03] p-0.5">
            <button type="button" className={tabClass("context")} onClick={() => setTab("context")}>
              {t.contextTab}
            </button>
            <button type="button" className={tabClass("tracking")} onClick={() => setTab("tracking")}>
              {t.trackingTab}
            </button>
          </div>
        </div>
        <div className="echomind-scroll echomind-safe-bottom min-h-0 w-full flex-1 px-4 py-4">
          {tab === "context" ? (
            <div className="flex w-full min-w-0 flex-col gap-4">
              <ActiveContextBar
                compact
                locale={locale}
                workflow={workflow}
                documentLabel={documentLabel}
                memoryLabel={memoryLabel}
                onClear={onClear}
              />
              <LifeSummaryCard locale={locale} snapshot={lifeSnapshot} onChanged={onLifeChanged} />
              <ConnectionsHub locale={locale} snapshot={lifeSnapshot} />
              <GoogleConnectionsCard locale={locale} />
              <ProvidersPanel locale={locale} />
              <HubStatus locale={locale} />
              <PreferencesCard
                locale={locale}
                preferences={preferences}
                tags={tagText}
                lifeSnapshot={lifeSnapshot}
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
