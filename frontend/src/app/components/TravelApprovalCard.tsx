"use client";

import { useState } from "react";

import { travelText } from "../lib/travelCopy";
import type { Locale } from "../lib/direction";
import type { TravelQuote } from "@/services/api";

type TravelApprovalCardProps = {
  locale: Locale;
  quote: TravelQuote;
  onConfirm: () => Promise<void> | void;
  confirmed?: boolean;
};

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
}

export default function TravelApprovalCard({
  locale,
  quote,
  onConfirm,
  confirmed = false,
}: TravelApprovalCardProps) {
  const t = travelText(locale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = confirmed || quote.status === "confirmed";

  const handleConfirm = async () => {
    if (locked || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="w-full max-w-lg self-start rounded-[1.6rem] border border-sky-500/25 bg-navy/90 p-4 shadow-lift">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300/80">
          {t.approval}
        </p>
        <span className="rounded-full border border-metal-line px-2.5 py-1 text-[11px] text-slate-300">
          {t.services[quote.service_type]}
        </span>
      </div>

      <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-100">
        {quote.destination}
        {quote.origin ? (
          <span className="ms-2 text-sm font-normal text-slate-400">
            ← {quote.origin}
          </span>
        ) : null}
      </h3>
      <p className="mt-1 text-sm text-slate-400">{quote.summary}</p>

      <dl className="mt-4 grid gap-3">
        {quote.hotel ? (
          <div className="rounded-2xl border border-metal-line bg-carbon/70 px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{t.hotel}</dt>
            <dd className="mt-1 text-sm text-slate-100">
              {quote.hotel.name}
              <span className="ms-2 text-slate-400">
                {quote.hotel.nights} {t.nights}
              </span>
            </dd>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-metal-line bg-carbon/70 px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{t.arrival}</dt>
            <dd className="mt-1 text-sm text-slate-100">{quote.estimated_arrival}</dd>
          </div>
          <div className="rounded-2xl border border-metal-line bg-carbon/70 px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{t.price}</dt>
            <dd className="mt-1 text-sm font-semibold text-sky-200">
              {money(quote.pricing.total, quote.pricing.currency)}
            </dd>
          </div>
        </div>
      </dl>

      <button
        type="button"
        className="mt-4 flex min-h-12 w-full items-center justify-center rounded-2xl border border-sky-400/40 bg-sky-400/15 text-sm font-semibold text-sky-100 transition enabled:hover:bg-sky-400/25 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
        disabled={locked || busy}
        aria-describedby="echomind-travel-secure"
        onClick={() => {
          void handleConfirm();
        }}
      >
        {locked ? t.confirmed : busy ? t.confirming : t.confirm}
      </button>
      <p id="echomind-travel-secure" className="mt-2 text-center text-[11px] text-slate-500">
        {t.secure}
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-center text-xs text-rose-300">
          {error}
        </p>
      ) : null}
    </article>
  );
}
