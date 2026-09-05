"use client";

import { useId, useRef, useState } from "react";

import { dashText } from "../lib/dashboardCopy";
import type { Locale } from "../lib/direction";
import {
  ApiError,
  parseDocumentFile,
  type DocumentParseResponse,
  type PillarId,
} from "@/services/api";

type DocumentUploadProps = {
  locale: Locale;
  onParsed: (doc: DocumentParseResponse) => void;
  onOpenPillar: (pillar: PillarId, doc: DocumentParseResponse) => void;
  onTrack?: (doc: DocumentParseResponse) => void;
};

const fieldClass =
  "w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-[16px] text-slate-100 placeholder:text-slate-500 focus:border-sky-500/40 focus:outline-none focus:ring-2 focus:ring-sky-400/40";

export default function DocumentUpload({
  locale,
  onParsed,
  onOpenPillar,
  onTrack,
}: DocumentUploadProps) {
  const t = dashText(locale);
  const fileId = useId();
  const cameraId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DocumentParseResponse | null>(null);

  const runParse = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const parsed = await parseDocumentFile(file, {
        hint: hint.trim() || undefined,
        locale,
      });
      setResult(parsed);
      onParsed(parsed);
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : t.parseFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[1.4rem] border border-metal-line bg-navy p-5 shadow-lift">
      <p className="text-[11px] uppercase tracking-[0.2em] text-sky-300/80">{t.scanTitle}</p>
      <p className="mt-1 text-sm text-slate-400">{t.scanHint}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="rounded-2xl border border-sky-500/30 bg-sky-400/10 px-3 py-2.5 text-sm font-semibold text-sky-100 disabled:opacity-40"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
        >
          {t.camera}
        </button>
        <button
          type="button"
          className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-sm font-semibold text-slate-200 disabled:opacity-40"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {t.files}
        </button>
      </div>

      <label className="mt-3 grid gap-1.5 text-sm text-slate-300">
        {t.hint}
        <textarea
          rows={2}
          className={`${fieldClass} resize-none text-sm`}
          value={hint}
          onChange={(event) => setHint(event.target.value)}
        />
      </label>

      <input
        id={fileId}
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*,application/pdf,.txt,.md"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void runParse(file);
        }}
      />
      <input
        id={cameraId}
        ref={cameraRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void runParse(file);
        }}
      />

      {busy ? <p className="mt-3 text-sm text-slate-400">{t.parsing}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

      {result ? (
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{t.extracted}</p>
          <p className="mt-1 text-sm text-slate-100">{result.summary}</p>
          {result.entities.amounts.length || result.entities.dates.length || result.entities.vendors.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-300">
              {result.entities.vendors.map((vendor) => (
                <li key={vendor} className="rounded-full border border-slate-800 px-2 py-0.5">
                  {vendor}
                </li>
              ))}
              {result.entities.amounts.map((amount) => (
                <li key={`£${amount}`} className="rounded-full border border-slate-800 px-2 py-0.5">
                  £{amount}
                </li>
              ))}
              {result.entities.dates.map((day) => (
                <li key={day} className="rounded-full border border-slate-800 px-2 py-0.5">
                  {day}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {result.delay_repay ? (
              <button
                type="button"
                className="rounded-full border border-sky-500/30 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold text-sky-200"
                onClick={() => onOpenPillar("delay_repay", result)}
              >
                {t.fillDelay}
              </button>
            ) : null}
            {result.consumer_rights ? (
              <button
                type="button"
                className="rounded-full border border-violet-500/30 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold text-violet-200"
                onClick={() => onOpenPillar("consumer_rights", result)}
              >
                {t.fillRights}
              </button>
            ) : null}
            {result.overdraft_shield ? (
              <button
                type="button"
                className="rounded-full border border-emerald-500/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200"
                onClick={() => onOpenPillar("overdraft_shield", result)}
              >
                {t.fillShield}
              </button>
            ) : null}
            {onTrack && (result.delay_repay || result.consumer_rights || result.overdraft_shield) ? (
              <button
                type="button"
                className="rounded-full border border-slate-800 px-3 py-1.5 text-xs text-slate-300"
                onClick={() => onTrack(result)}
              >
                {t.track}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
