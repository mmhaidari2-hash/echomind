"use client";

import { useEffect, useRef, useState } from "react";

import { dashText } from "../lib/dashboardCopy";
import type { Locale } from "../lib/direction";
import type { LifeSnapshot, UserPreferences } from "@/services/api";
import { useAssistantMemory } from "../hooks/useAssistantMemory";
import {
  deriveContextSuggestions,
  type ContextField,
  type ContextSuggestion,
} from "../lib/contextSuggestions";

type PreferencesCardProps = {
  locale: Locale;
  preferences: UserPreferences;
  tags: string;
  /** Life Graph snapshot — the source of auto-inferred suggestions. */
  lifeSnapshot?: LifeSnapshot | null;
  onSave: (prefs: UserPreferences, tags: string) => Promise<void>;
};

const fieldClass =
  "w-full rounded-2xl border border-white/[0.09] bg-white/[0.04] px-3 py-2.5 text-[16px] text-ink";

/** Market -> its defaults. GB -> GBP / en-GB / GB. */
const MARKET_DEFAULTS: Record<string, { currency: string; externalLanguage: string; jurisdiction: string }> = {
  GB: { currency: "GBP", externalLanguage: "en-GB", jurisdiction: "GB" },
  US: { currency: "USD", externalLanguage: "en-US", jurisdiction: "US" },
  EU: { currency: "EUR", externalLanguage: "en-GB", jurisdiction: "GB" },
};

function marketDefaults(market: string) {
  return MARKET_DEFAULTS[market.toUpperCase()] ?? MARKET_DEFAULTS.GB;
}

const FIELD_LABELS: Record<ContextField, { en: string; fa: string }> = {
  home_station: { en: "Home station", fa: "ایستگاه خانه" },
  work_station: { en: "Work station", fa: "ایستگاه محل کار" },
  operator: { en: "Usual operator", fa: "اپراتور معمول" },
  bank: { en: "Usual bank", fa: "بانک معمول" },
  retailer: { en: "Usual retailer", fa: "فروشگاه معمول" },
};

export default function PreferencesCard({
  locale,
  preferences,
  tags,
  lifeSnapshot = null,
  onSave,
}: PreferencesCardProps) {
  const t = dashText(locale);
  const { facts } = useAssistantMemory();
  const [name, setName] = useState(preferences.display_name ?? "");
  const [home, setHome] = useState(preferences.home_station ?? "");
  const [work, setWork] = useState(preferences.work_station ?? "");
  const [operator, setOperator] = useState(preferences.preferred_operator ?? "");
  const [retailer, setRetailer] = useState(preferences.preferred_retailer ?? "");
  const [bank, setBank] = useState(preferences.preferred_bank ?? "");
  const [tagText, setTagText] = useState(tags);
  const [uiLanguage, setUiLanguage] = useState(preferences.ui_language ?? "en");
  const [commandLanguage, setCommandLanguage] = useState(preferences.command_language ?? "auto");
  const [externalLanguage, setExternalLanguage] = useState(preferences.external_language ?? "en-GB");
  const [homeMarket, setHomeMarket] = useState(preferences.home_market ?? "GB");
  const [jurisdiction, setJurisdiction] = useState(preferences.jurisdiction ?? "GB");
  const [currency, setCurrency] = useState(preferences.currency ?? "GBP");
  const [travelDestination, setTravelDestination] = useState(preferences.travel_destination ?? "");
  const [regionalOpen, setRegionalOpen] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const prevMarketRef = useRef(homeMarket);

  useEffect(() => {
    setName(preferences.display_name ?? "");
    setHome(preferences.home_station ?? "");
    setWork(preferences.work_station ?? "");
    setOperator(preferences.preferred_operator ?? "");
    setRetailer(preferences.preferred_retailer ?? "");
    setBank(preferences.preferred_bank ?? "");
    setTagText(tags);
    setUiLanguage(preferences.ui_language ?? "en");
    setCommandLanguage(preferences.command_language ?? "auto");
    setExternalLanguage(preferences.external_language ?? "en-GB");
    setHomeMarket(preferences.home_market ?? "GB");
    setJurisdiction(preferences.jurisdiction ?? "GB");
    setCurrency(preferences.currency ?? "GBP");
    setTravelDestination(preferences.travel_destination ?? "");
  }, [preferences, tags]);

  /* Auto-derive regional defaults from Home market — only the fields
     the user has not touched by hand follow the market. */
  const onMarketChange = (next: string) => {
    const prev = marketDefaults(prevMarketRef.current);
    const defs = marketDefaults(next);
    if (currency === prev.currency) setCurrency(defs.currency);
    if (externalLanguage === prev.externalLanguage) setExternalLanguage(defs.externalLanguage);
    if (jurisdiction === prev.jurisdiction) setJurisdiction(defs.jurisdiction);
    prevMarketRef.current = next;
    setHomeMarket(next);
  };

  const suggestions = deriveContextSuggestions(facts, lifeSnapshot);
  const currentValue: Record<ContextField, string> = {
    home_station: home,
    work_station: work,
    operator,
    bank,
    retailer,
  };
  const pendingSuggestions = suggestions.filter(
    (s) => !currentValue[s.field].trim() && !applied.has(`${s.field}:${s.value.toLowerCase()}`),
  );

  const applySuggestion = (s: ContextSuggestion) => {
    if (s.field === "home_station") setHome(s.value);
    if (s.field === "work_station") setWork(s.value);
    if (s.field === "operator") setOperator(s.value);
    if (s.field === "bank") setBank(s.value);
    if (s.field === "retailer") setRetailer(s.value);
    setApplied((prev) => new Set(prev).add(`${s.field}:${s.value.toLowerCase()}`));
  };

  return (
    <section className="rounded-3xl border border-white/[0.09] bg-white/[0.04] p-4">
      <p className="text-[11px] uppercase tracking-[0.2em] text-gold/80">{t.profileTitle}</p>
      <p className="mt-1 text-xs text-muted">{t.profileHint}</p>

      {/* Auto-inferred context (mockup 2): one-tap chips from the
          user's own documents and Life Graph. Nothing invented — when
          there is nothing to infer, the section says so honestly. */}
      <div className="mt-4">
        <p className="echomind-meta text-gold">
          {locale === "fa" ? "زمینهٔ خودکار" : "Auto-inferred context"}
        </p>
        {pendingSuggestions.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {locale === "fa"
              ? "هنوز پیشنهادی نیست — جیمیل را وصل کنید یا سندی اسکن کنید تا اکومایند این‌ها را یاد بگیرد."
              : "No suggestions yet — connect Gmail or scan a document and EchoMind will learn these."}
          </p>
        ) : (
          <div className="mt-2 flex flex-col items-start gap-2">
            {pendingSuggestions.map((s) => (
              <button
                key={`${s.field}:${s.value}`}
                type="button"
                onClick={() => applySuggestion(s)}
                className="flex min-h-11 items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.04] px-3.5 py-2 text-sm text-ink transition hover:border-gold/50"
                aria-label={`${FIELD_LABELS[s.field][locale]}: ${s.value}`}
              >
                <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                  ✓
                </span>
                <span className="font-semibold">{FIELD_LABELS[s.field][locale]}:</span>
                <span>{s.value}</span>
                <span className="text-[11px] text-muted">
                  {s.source === "document"
                    ? locale === "fa" ? "· از سند" : "· from a document"
                    : s.source === "obligation"
                      ? locale === "fa" ? "· از مهلت" : "· from a deadline"
                      : locale === "fa" ? "· از قول" : "· from a promise"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-3">
        <label className="grid gap-1.5 text-xs text-muted">
          {t.displayName}
          <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-xs text-muted">
            {t.homeStation}
            <input className={fieldClass} value={home} onChange={(e) => setHome(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-xs text-muted">
            {t.workStation}
            <input className={fieldClass} value={work} onChange={(e) => setWork(e.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-xs text-muted">
            {t.preferredOperator}
            <input className={fieldClass} value={operator} onChange={(e) => setOperator(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-xs text-muted">
            {t.preferredBank}
            <input className={fieldClass} value={bank} onChange={(e) => setBank(e.target.value)} />
          </label>
        </div>
        <label className="grid gap-1.5 text-xs text-muted">
          {t.preferredRetailer}
          <input className={fieldClass} value={retailer} onChange={(e) => setRetailer(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-xs text-muted">
            {locale === "fa" ? "زبان رابط" : "UI language"}
            <select className={fieldClass} value={uiLanguage} onChange={(e) => setUiLanguage(e.target.value as "en" | "fa")}>
              <option value="en">English</option>
              <option value="fa">فارسی</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs text-muted">
            {locale === "fa" ? "بازار اصلی" : "Home market"}
            <input className={fieldClass} value={homeMarket} onChange={(e) => onMarketChange(e.target.value.toUpperCase())} />
          </label>
        </div>

        {/* Regional & Advanced Defaults (mockup 2): secondary locale
            fields collapse away; defaults follow Home market. */}
        <div className="rounded-2xl border border-white/[0.09] bg-white/[0.04]">
          <button
            type="button"
            className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2.5 text-start text-sm font-semibold text-ink"
            aria-expanded={regionalOpen}
            onClick={() => setRegionalOpen((open) => !open)}
          >
            {locale === "fa" ? "پیش‌فرض‌های منطقه‌ای و پیشرفته" : "Regional & Advanced Defaults"}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className={`h-4 w-4 shrink-0 text-muted transition-transform ${regionalOpen ? "rotate-180" : ""}`}
            >
              <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {regionalOpen ? (
            <div className="grid gap-3 border-t border-white/[0.09] p-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-xs text-muted">
                  {locale === "fa" ? "زبان فرمان" : "Command language"}
                  <select className={fieldClass} value={commandLanguage} onChange={(e) => setCommandLanguage(e.target.value as "auto" | "en" | "fa")}>
                    <option value="auto">Auto</option>
                    <option value="en">English</option>
                    <option value="fa">فارسی</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs text-muted">
                  {locale === "fa" ? "زبان ارتباط بیرونی" : "External language"}
                  <input className={fieldClass} value={externalLanguage} onChange={(e) => setExternalLanguage(e.target.value)} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-xs text-muted">
                  {locale === "fa" ? "حوزه قانونی" : "Jurisdiction"}
                  <input className={fieldClass} value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value.toUpperCase())} />
                </label>
                <label className="grid gap-1.5 text-xs text-muted">
                  {locale === "fa" ? "ارز" : "Currency"}
                  <input className={fieldClass} maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
                </label>
              </div>
              <p className="text-[11px] leading-relaxed text-muted">
                {locale === "fa"
                  ? `از بازار اصلی گرفته شده: ${homeMarket} ← ${marketDefaults(homeMarket).currency}، ${marketDefaults(homeMarket).externalLanguage}، ${marketDefaults(homeMarket).jurisdiction}. هر کدام را دستی عوض کنید، دیگر خودکار تغییر نمی‌کند.`
                  : `Derived from Home market: ${homeMarket} → ${marketDefaults(homeMarket).currency}, ${marketDefaults(homeMarket).externalLanguage}, ${marketDefaults(homeMarket).jurisdiction}. Change one by hand and it stops following the market.`}
              </p>
            </div>
          ) : null}
        </div>

        <label className="grid gap-1.5 text-xs text-muted">
          {locale === "fa" ? "مقصد سفر فعلی" : "Current travel destination"}
          <input className={fieldClass} value={travelDestination} onChange={(e) => setTravelDestination(e.target.value)} />
        </label>
        <label className="grid gap-1.5 text-xs text-muted">
          {t.contextTags}
          <input
            className={fieldClass}
            value={tagText}
            placeholder={t.tagsPlaceholder}
            onChange={(e) => setTagText(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="echomind-gold-btn px-4 py-2.5 text-sm font-bold"
          disabled={saveState === "saving"}
          onClick={async () => {
            setSaveState("saving");
            try {
              await onSave(
                {
                  display_name: name || null,
                  locale,
                  ui_language: uiLanguage,
                  command_language: commandLanguage,
                  external_language: externalLanguage || "en-GB",
                  home_market: homeMarket || "GB",
                  jurisdiction: jurisdiction || "GB",
                  currency: currency || "GBP",
                  travel_destination: travelDestination || null,
                  home_station: home || null,
                  work_station: work || null,
                  preferred_operator: operator || null,
                  preferred_retailer: retailer || null,
                  preferred_bank: bank || null,
                  tone: preferences.tone ?? "concise",
                },
                tagText,
              );
              setSaveState("saved");
              window.setTimeout(() => setSaveState("idle"), 1400);
            } catch {
              setSaveState("error");
            }
          }}
        >
          {saveState === "saving"
            ? locale === "fa" ? "در حال ذخیره…" : "Saving…"
            : saveState === "saved"
              ? t.profileSaved
              : t.saveProfile}
        </button>
        {saveState === "error" ? (
          <p role="alert" className="text-xs text-red-300">
            {locale === "fa"
              ? "ذخیره نشد. ورود و اتصال امن را بررسی کن."
              : "Could not save. Check your secure sign-in and connection."}
          </p>
        ) : null}
      </div>
    </section>
  );
}
