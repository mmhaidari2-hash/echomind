"use client";

import { useEffect, useState } from "react";

import { dashText } from "../lib/dashboardCopy";
import type { Locale } from "../lib/direction";
import type { UserPreferences } from "@/services/api";

type PreferencesCardProps = {
  locale: Locale;
  preferences: UserPreferences;
  tags: string;
  onSave: (prefs: UserPreferences, tags: string) => Promise<void>;
};

const fieldClass =
  "w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-[16px] text-slate-100";

export default function PreferencesCard({
  locale,
  preferences,
  tags,
  onSave,
}: PreferencesCardProps) {
  const t = dashText(locale);
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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

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

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
      <p className="text-[11px] uppercase tracking-[0.2em] text-sky-300/80">{t.profileTitle}</p>
      <p className="mt-1 text-xs text-slate-400">{t.profileHint}</p>
      <div className="mt-3 grid gap-3">
        <label className="grid gap-1.5 text-xs text-slate-400">
          {t.displayName}
          <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-xs text-slate-400">
            {t.homeStation}
            <input className={fieldClass} value={home} onChange={(e) => setHome(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-xs text-slate-400">
            {t.workStation}
            <input className={fieldClass} value={work} onChange={(e) => setWork(e.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-xs text-slate-400">
            {t.preferredOperator}
            <input className={fieldClass} value={operator} onChange={(e) => setOperator(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-xs text-slate-400">
            {t.preferredBank}
            <input className={fieldClass} value={bank} onChange={(e) => setBank(e.target.value)} />
          </label>
        </div>
        <label className="grid gap-1.5 text-xs text-slate-400">
          {t.preferredRetailer}
          <input className={fieldClass} value={retailer} onChange={(e) => setRetailer(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-xs text-slate-400">
            {locale === "fa" ? "زبان رابط" : "UI language"}
            <select className={fieldClass} value={uiLanguage} onChange={(e) => setUiLanguage(e.target.value as "en" | "fa")}>
              <option value="en">English</option>
              <option value="fa">فارسی</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs text-slate-400">
            {locale === "fa" ? "زبان فرمان" : "Command language"}
            <select className={fieldClass} value={commandLanguage} onChange={(e) => setCommandLanguage(e.target.value as "auto" | "en" | "fa")}>
              <option value="auto">Auto</option>
              <option value="en">English</option>
              <option value="fa">فارسی</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-xs text-slate-400">
            {locale === "fa" ? "بازار اصلی" : "Home market"}
            <input className={fieldClass} value={homeMarket} onChange={(e) => setHomeMarket(e.target.value.toUpperCase())} />
          </label>
          <label className="grid gap-1.5 text-xs text-slate-400">
            {locale === "fa" ? "حوزه قانونی" : "Jurisdiction"}
            <input className={fieldClass} value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value.toUpperCase())} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-xs text-slate-400">
            {locale === "fa" ? "ارز" : "Currency"}
            <input className={fieldClass} maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          </label>
          <label className="grid gap-1.5 text-xs text-slate-400">
            {locale === "fa" ? "زبان ارتباط بیرونی" : "External language"}
            <input className={fieldClass} value={externalLanguage} onChange={(e) => setExternalLanguage(e.target.value)} />
          </label>
        </div>
        <label className="grid gap-1.5 text-xs text-slate-400">
          {locale === "fa" ? "مقصد سفر فعلی" : "Current travel destination"}
          <input className={fieldClass} value={travelDestination} onChange={(e) => setTravelDestination(e.target.value)} />
        </label>
        <label className="grid gap-1.5 text-xs text-slate-400">
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
          className="rounded-2xl border border-sky-500/30 bg-sky-400/10 px-4 py-2.5 text-sm font-semibold text-sky-100"
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
          <p role="alert" className="text-xs text-rose-300">
            {locale === "fa"
              ? "ذخیره نشد. ورود و اتصال امن را بررسی کن."
              : "Could not save. Check your secure sign-in and connection."}
          </p>
        ) : null}
      </div>
    </section>
  );
}
