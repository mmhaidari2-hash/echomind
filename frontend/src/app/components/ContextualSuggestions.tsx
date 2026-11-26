"use client";

import { dashText } from "../lib/dashboardCopy";
import type { Locale } from "../lib/direction";
import type { PillarId, UserPreferences } from "@/services/api";

export type ContextSuggestion = {
  id: string;
  label: string;
  draft?: string;
  pillar?: PillarId;
};

type ContextualSuggestionsProps = {
  locale: Locale;
  suggestions: ContextSuggestion[];
  onPick: (item: ContextSuggestion) => void;
};

export function buildSuggestions(
  locale: Locale,
  prefs: UserPreferences | null,
  tags: string[],
  lastPillar?: PillarId,
): ContextSuggestion[] {
  const items: ContextSuggestion[] = [];
  if (prefs?.home_station) {
    items.push({
      id: "book-from-home",
      label: locale === "fa" ? `سفر از ${prefs.home_station}` : `Trip from ${prefs.home_station}`,
      draft:
        locale === "fa"
          ? `برای فردا از ${prefs.home_station} بلیط قطار به لندن بگیر`
          : `Book me a train from ${prefs.home_station} to London tomorrow`,
    });
    items.push({
      id: "from-home",
      label: locale === "fa" ? `تأخیر از ${prefs.home_station}` : `Delay from ${prefs.home_station}`,
      pillar: "delay_repay",
      draft:
        locale === "fa"
          ? `قطار من از ${prefs.home_station} تأخیر داشت.`
          : `My train from ${prefs.home_station} was delayed.`,
    });
  }
  if (prefs?.preferred_operator) {
    items.push({
      id: "operator",
      label: locale === "fa" ? `ادعای ${prefs.preferred_operator}` : `${prefs.preferred_operator} claim`,
      pillar: "delay_repay",
    });
  }
  if (prefs?.preferred_retailer) {
    items.push({
      id: "retailer",
      label: locale === "fa" ? `بازپرداخت ${prefs.preferred_retailer}` : `${prefs.preferred_retailer} refund`,
      pillar: "consumer_rights",
    });
  }
  if (prefs?.preferred_bank || tags.includes("overdraft")) {
    items.push({
      id: "bank",
      label: locale === "fa" ? "کارمزد اضافه برداشت" : "Overdraft fee",
      pillar: "overdraft_shield",
    });
  }
  if (lastPillar === "delay_repay") {
    items.push({
      id: "continue-travel",
      label: locale === "fa" ? "ادامه Delay Repay" : "Continue Delay Repay",
      pillar: "delay_repay",
    });
  }
  if (lastPillar === "consumer_rights") {
    items.push({
      id: "continue-rights",
      label: locale === "fa" ? "ادامه حقوق مصرف‌کننده" : "Continue Consumer Rights",
      pillar: "consumer_rights",
    });
  }
  return items.slice(0, 4);
}

export default function ContextualSuggestions({
  locale,
  suggestions,
  onPick,
}: ContextualSuggestionsProps) {
  const t = dashText(locale);
  if (!suggestions.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      <p className="w-full text-[11px] uppercase tracking-[0.16em] text-muted">{t.contextTitle}</p>
      {suggestions.map((item) => (
        <button
          key={item.id}
          type="button"
          className="rounded-full border border-white/[0.09] bg-white/[0.04] px-3 py-1.5 text-xs text-ink-soft"
          onClick={() => onPick(item)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
