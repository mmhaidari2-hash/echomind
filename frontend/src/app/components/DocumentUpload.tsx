"use client";

import { useId, useRef, useState } from "react";

import { dashText } from "../lib/dashboardCopy";
import { copy } from "../lib/copy";
import type { Locale } from "../lib/direction";
import { getPhotoService } from "../../services/photos";
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
  "w-full rounded-2xl border border-white/[0.09] bg-white/[0.06] px-3 py-2.5 text-[16px] text-ink placeholder:text-muted focus:border-gold/50 focus:outline-none focus:ring-2 focus:ring-gold/50";

export default function DocumentUpload({
  locale,
  onParsed,
  onOpenPillar,
  onTrack,
}: DocumentUploadProps) {
  const t = dashText(locale);
  const c = copy[locale];
  const fileId = useId();
  const cameraId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
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

  /** Attach a photo from the library or the camera and scan it as a
      document/receipt. Native Capacitor Camera on the phone; the
      hidden file inputs on the web. A denied permission is reported
      honestly — never claim access that was not granted. */
  const pickPhoto = async (kind: "library" | "camera") => {
    setPhotoNotice(null);
    const service = await getPhotoService();
    const result =
      kind === "library" ? await service.pickFromLibrary() : await service.takePhoto();
    if (result.ok) {
      void runParse(result.file);
      return;
    }
    if (result.reason === "denied") {
      setPhotoNotice(c.photoDenied);
      return;
    }
    if (result.reason === "error") {
      setPhotoNotice(c.photoError);
      return;
    }
    if (result.reason === "web-fallback") {
      if (kind === "library") fileRef.current?.click();
      else cameraRef.current?.click();
    }
    // "cancelled": the user closed the picker — nothing to say.
  };

  return (
    <section className="rounded-[1.4rem] border border-white/[0.09] bg-white/[0.03] p-5 shadow-lift">
      <p className="text-[11px] uppercase tracking-[0.2em] text-gold/80">{t.scanTitle}</p>
      <p className="mt-1 text-sm text-muted">{t.scanHint}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="rounded-2xl border border-gold/40 bg-gold/10 px-3 py-2.5 text-sm font-semibold text-gold disabled:opacity-40"
          disabled={busy}
          onClick={() => void pickPhoto("library")}
        >
          {c.photoLibrary}
        </button>
        <button
          type="button"
          className="rounded-2xl border border-gold/40 bg-gold/10 px-3 py-2.5 text-sm font-semibold text-gold disabled:opacity-40"
          disabled={busy}
          onClick={() => void pickPhoto("camera")}
        >
          {c.takePhoto}
        </button>
        <button
          type="button"
          className="col-span-2 rounded-2xl border border-white/[0.09] bg-white/[0.06] px-3 py-2.5 text-sm font-semibold text-ink-soft disabled:opacity-40"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {t.files}
        </button>
      </div>

      {photoNotice ? (
        <p className="mt-3 text-sm text-ink-soft" role="status">
          {photoNotice}
        </p>
      ) : null}

      <label className="mt-3 grid gap-1.5 text-sm text-ink-soft">
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

      {busy ? <p className="mt-3 text-sm text-muted">{t.parsing}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      {result ? (
        <div className="mt-4 rounded-2xl border border-white/[0.09] bg-white/60 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">{t.extracted}</p>
          <p className="mt-1 text-sm text-ink">{result.summary}</p>
          {result.entities.amounts.length || result.entities.dates.length || result.entities.vendors.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-ink-soft">
              {result.entities.vendors.map((vendor) => (
                <li key={vendor} className="rounded-full border border-white/[0.09] px-2 py-0.5">
                  {vendor}
                </li>
              ))}
              {result.entities.amounts.map((amount) => (
                <li key={`£${amount}`} className="rounded-full border border-white/[0.09] px-2 py-0.5">
                  £{amount}
                </li>
              ))}
              {result.entities.dates.map((day) => (
                <li key={day} className="rounded-full border border-white/[0.09] px-2 py-0.5">
                  {day}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {result.delay_repay ? (
              <button
                type="button"
                className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold"
                onClick={() => onOpenPillar("delay_repay", result)}
              >
                {t.fillDelay}
              </button>
            ) : null}
            {result.consumer_rights ? (
              <button
                type="button"
                className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold"
                onClick={() => onOpenPillar("consumer_rights", result)}
              >
                {t.fillRights}
              </button>
            ) : null}
            {result.overdraft_shield ? (
              <button
                type="button"
                className="rounded-full border border-emerald-600/30 bg-emerald-600/10 px-3 py-1.5 text-xs font-semibold text-emerald-300"
                onClick={() => onOpenPillar("overdraft_shield", result)}
              >
                {t.fillShield}
              </button>
            ) : null}
            {onTrack && (result.delay_repay || result.consumer_rights || result.overdraft_shield) ? (
              <button
                type="button"
                className="rounded-full border border-white/[0.09] px-3 py-1.5 text-xs text-ink-soft"
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
