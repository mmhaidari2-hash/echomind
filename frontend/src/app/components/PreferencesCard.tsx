"use client";

import { useEffect, useState } from "react";

import { dashText } from "../lib/dashboardCopy";
import type { Locale } from "../lib/direction";
import type { UserPreferences } from "@/services/api";

type PreferencesCardProps = {
  locale: Locale;
  preferences: UserPreferences;
  tags: string;
  onSave: (prefs: UserPreferences, tags: string) => void;
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
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(preferences.display_name ?? "");
    setHome(preferences.home_station ?? "");
    setWork(preferences.work_station ?? "");
    setOperator(preferences.preferred_operator ?? "");
    setRetailer(preferences.preferred_retailer ?? "");
    setBank(preferences.preferred_bank ?? "");
    setTagText(tags);
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
          onClick={() => {
            onSave(
              {
                display_name: name || null,
                locale,
                home_station: home || null,
                work_station: work || null,
                preferred_operator: operator || null,
                preferred_retailer: retailer || null,
                preferred_bank: bank || null,
                tone: preferences.tone ?? "concise",
              },
              tagText,
            );
            setSaved(true);
            window.setTimeout(() => setSaved(false), 1400);
          }}
        >
          {saved ? t.profileSaved : t.saveProfile}
        </button>
      </div>
    </section>
  );
}
