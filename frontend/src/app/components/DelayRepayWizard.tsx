"use client";

import { useEffect, useMemo, useState } from "react";

import { delayText } from "../lib/delayRepayCopy";
import type { Locale } from "../lib/direction";
import {
  ApiError,
  listDelayRepayOperators,
  parseDocumentFile,
  submitDelayRepayClaim,
  type DelayRepayClaimResponse,
  type DelayRepayOperator,
  type DelayRepayPrefill,
  type TicketType,
  type WatchPayload,
} from "@/services/api";

type WizardStep = 1 | 2 | 3;

type DelayRepayWizardProps = {
  locale: Locale;
  onClose: () => void;
  prefill?: DelayRepayPrefill | null;
  onTracked?: (watch: WatchPayload) => void;
};

function asTicketType(value?: string | null): TicketType | null {
  if (
    value === "single" ||
    value === "return" ||
    value === "season_weekly" ||
    value === "season_monthly" ||
    value === "season_annual"
  ) {
    return value;
  }
  return null;
}

const TICKET_TYPES: TicketType[] = [
  "single",
  "return",
  "season_weekly",
  "season_monthly",
  "season_annual",
];

const fieldClass =
  "w-full rounded-2xl border border-white/[0.09] bg-white/[0.06] px-3 py-2.5 text-[16px] text-ink placeholder:text-muted focus:border-gold/50 focus:outline-none focus:ring-2 focus:ring-gold/50";

function money(value: string | number): string {
  const amount = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(amount)) return String(value);
  return `£${amount.toFixed(2)}`;
}

export default function DelayRepayWizard({
  locale,
  onClose,
  prefill,
  onTracked,
}: DelayRepayWizardProps) {
  const t = delayText(locale);
  const [step, setStep] = useState<WizardStep>(1);
  const [operators, setOperators] = useState<DelayRepayOperator[]>([]);
  const [operator, setOperator] = useState(prefill?.operator ?? "");
  const [origin, setOrigin] = useState(prefill?.origin ?? "");
  const [destination, setDestination] = useState(prefill?.destination ?? "");
  const [journeyDate, setJourneyDate] = useState(prefill?.journey_date ?? "");
  const [delayMinutes, setDelayMinutes] = useState(
    prefill?.delay_minutes != null ? String(prefill.delay_minutes) : "30",
  );
  const [scheduled, setScheduled] = useState("");
  const [actual, setActual] = useState("");
  const [ticketType, setTicketType] = useState<TicketType>(asTicketType(prefill?.ticket_type) ?? "single");
  const [ticketCost, setTicketCost] = useState(
    prefill?.ticket_cost != null ? String(prefill.ticket_cost) : "24.50",
  );
  const [ticketReference, setTicketReference] = useState(prefill?.ticket_reference ?? "");
  const [proofName, setProofName] = useState(prefill?.proof_filename ?? "");
  const [passenger, setPassenger] = useState(prefill?.passenger_name ?? "");
  const [result, setResult] = useState<DelayRepayClaimResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listDelayRepayOperators()
      .then((rows) => {
        if (!cancelled) setOperators(rows);
      })
      .catch(() => {
        if (!cancelled) setOperators([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ticketLabels = useMemo(
    () => ({
      single: t.single,
      return: t.return,
      season_weekly: t.seasonWeekly,
      season_monthly: t.seasonMonthly,
      season_annual: t.seasonAnnual,
    }),
    [t],
  );

  const canContinueJourney = operator.trim().length > 0 && Number(delayMinutes) >= 0;
  const canCalculate = Number(ticketCost) > 0;

  const calculate = async () => {
    setBusy(true);
    setError(null);
    try {
      const reply = await submitDelayRepayClaim({
        operator,
        origin: origin || undefined,
        destination: destination || undefined,
        journey_date: journeyDate || undefined,
        delay_minutes: Number(delayMinutes),
        scheduled_arrival: scheduled || undefined,
        actual_arrival: actual || undefined,
        ticket_type: ticketType,
        ticket_cost: Number(ticketCost),
        ticket_reference: ticketReference || undefined,
        proof_filename: proofName || undefined,
        passenger_name: passenger || undefined,
        locale,
      });
      setResult(reply);
      setStep(3);
      onTracked?.({
        kind: "delay_repay",
        title: [reply.operator_name, origin, destination].filter(Boolean).join(" · ") || reply.operator_name,
        anchor_date: journeyDate || undefined,
        amount: Number(reply.estimate_gbp),
        locale,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.failed);
    } finally {
      setBusy(false);
    }
  };

  const copyDraft = async () => {
    if (!result?.claim_draft) return;
    try {
      await navigator.clipboard.writeText(result.claim_draft);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="rounded-3xl border border-white/[0.09] bg-white/[0.04] p-4 shadow-[0_10px_30px_rgba(2,6,23,0.28)] backdrop-blur-xl sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold/80">{t.subtitle}</p>
          <h2 className="mt-1 font-sans text-xl font-semibold text-ink">{t.title}</h2>
          <p className="mt-1 text-xs text-muted">{t.bands}</p>
        </div>
        <button
          type="button"
          className="rounded-full border border-white/[0.09] px-3 py-1 text-xs text-muted hover:text-ink"
          onClick={onClose}
        >
          {t.close}
        </button>
      </div>

      <ol className="mb-5 grid grid-cols-3 gap-2 text-center text-[11px] font-medium">
        {[t.stepJourney, t.stepTicket, t.stepResult].map((label, index) => {
          const current = (index + 1) as WizardStep;
          const active = step === current;
          const done = step > current;
          return (
            <li
              key={label}
              className={`rounded-full border px-2 py-1.5 ${
                active
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : done
                    ? "border-white/[0.09] text-ink-soft"
                    : "border-white/[0.09] text-muted"
              }`}
            >
              {label}
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm text-ink-soft">
            {t.operator}
            <select
              className={fieldClass}
              value={operator}
              onChange={(event) => setOperator(event.target.value)}
            >
              <option value="">{t.operatorPlaceholder}</option>
              {operators.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm text-ink-soft">
              {t.origin}
              <input className={fieldClass} value={origin} onChange={(e) => setOrigin(e.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm text-ink-soft">
              {t.destination}
              <input
                className={fieldClass}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm text-ink-soft">
            {t.journeyDate}
            <input
              type="date"
              className={fieldClass}
              value={journeyDate}
              onChange={(e) => setJourneyDate(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm text-ink-soft">
            {t.delayMinutes}
            <input
              type="number"
              min={0}
              max={1440}
              className={fieldClass}
              value={delayMinutes}
              onChange={(e) => setDelayMinutes(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm text-ink-soft">
              {t.scheduled}
              <input
                type="time"
                className={fieldClass}
                value={scheduled}
                onChange={(e) => setScheduled(e.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm text-ink-soft">
              {t.actual}
              <input type="time" className={fieldClass} value={actual} onChange={(e) => setActual(e.target.value)} />
            </label>
          </div>
          <button
            type="button"
            className="mt-1 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm font-semibold text-gold disabled:opacity-40"
            disabled={!canContinueJourney}
            onClick={() => setStep(2)}
          >
            {t.next}
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm text-ink-soft">
            {t.ticketType}
            <select
              className={fieldClass}
              value={ticketType}
              onChange={(event) => setTicketType(event.target.value as TicketType)}
            >
              {TICKET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ticketLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm text-ink-soft">
            {t.ticketCost}
            <input
              type="number"
              min={0.01}
              step={0.01}
              className={fieldClass}
              value={ticketCost}
              onChange={(e) => setTicketCost(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm text-ink-soft">
            {t.ticketReference}
            <input
              className={fieldClass}
              value={ticketReference}
              onChange={(e) => setTicketReference(e.target.value)}
              placeholder="ABC123456"
            />
          </label>
          <label className="grid gap-1.5 text-sm text-ink-soft">
            {t.proof}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="text-sm text-muted file:me-3 file:rounded-full file:border-0 file:bg-white/[0.08]/10 file:px-3 file:py-1.5 file:text-ink-soft"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setProofName(file?.name ?? "");
                if (!file) return;
                void parseDocumentFile(file, { locale }).then((parsed) => {
                  const fill = parsed.delay_repay;
                  if (!fill) return;
                  if (!operator && fill.operator) setOperator(fill.operator);
                  if (!origin && fill.origin) setOrigin(fill.origin);
                  if (!destination && fill.destination) setDestination(fill.destination);
                  if (!journeyDate && fill.journey_date) setJourneyDate(fill.journey_date);
                  if (fill.delay_minutes != null) setDelayMinutes(String(fill.delay_minutes));
                  const nextType = asTicketType(fill.ticket_type);
                  if (nextType) setTicketType(nextType);
                  if (fill.ticket_cost != null) setTicketCost(String(fill.ticket_cost));
                  if (!ticketReference && fill.ticket_reference) setTicketReference(fill.ticket_reference);
                });
              }}
            />
            {proofName ? <span className="text-xs text-muted">{proofName}</span> : null}
          </label>
          <label className="grid gap-1.5 text-sm text-ink-soft">
            {t.passenger}
            <input className={fieldClass} value={passenger} onChange={(e) => setPassenger(e.target.value)} />
          </label>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-2xl border border-white/[0.09] px-4 py-3 text-sm text-ink-soft"
              onClick={() => setStep(1)}
            >
              {t.back}
            </button>
            <button
              type="button"
              className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm font-semibold text-gold disabled:opacity-40"
              disabled={!canCalculate || busy}
              onClick={() => void calculate()}
            >
              {busy ? "…" : t.calculate}
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 && result ? (
        <div className="grid gap-4">
          <div
            className={`rounded-2xl border px-4 py-3 ${
              result.eligible
                ? "border-emerald-500/25 bg-emerald-600/10 text-emerald-100"
                : "border-amber-500/25 bg-gold/10 text-gold"
            }`}
          >
            <p className="text-xs uppercase tracking-[0.16em] opacity-80">
              {result.eligible ? t.eligible : t.notEligible}
            </p>
            <p className="mt-1 text-2xl font-semibold">{money(result.estimate_gbp)}</p>
            <p className="mt-1 text-sm opacity-90">
              {result.tier_label} · {result.percent}%
            </p>
          </div>
          <p className="text-sm text-ink-soft">
            <span className="text-muted">{t.basis}: </span>
            {money(result.basis_amount)} · {result.operator_name}
          </p>
          <p className="text-sm text-muted">
            <span className="text-muted">{t.guideline}: </span>
            {result.guideline}
          </p>
          <ol className="space-y-1.5 ps-4 text-sm text-ink-soft">
            {result.next_steps.map((stepText) => (
              <li key={stepText} className="list-decimal">
                {stepText}
              </li>
            ))}
          </ol>
          <label className="grid gap-1.5 text-sm text-ink-soft">
            {t.draft}
            <textarea
              readOnly
              rows={8}
              className={`${fieldClass} resize-none text-sm leading-6`}
              value={result.claim_draft}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-2xl border border-white/[0.09] px-4 py-3 text-sm text-ink-soft"
              onClick={() => void copyDraft()}
            >
              {copied ? t.copied : t.copyDraft}
            </button>
            {result.claim_url ? (
              <a
                href={result.claim_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-center text-sm font-semibold text-gold"
              >
                {t.openForm}
              </a>
            ) : (
              <button
                type="button"
                className="rounded-2xl border border-white/[0.09] px-4 py-3 text-sm text-ink-soft"
                onClick={() => {
                  setResult(null);
                  setStep(1);
                }}
              >
                {t.startOver}
              </button>
            )}
          </div>
          {result.claim_url ? (
            <button
              type="button"
              className="text-sm text-muted underline-offset-2 hover:underline"
              onClick={() => {
                setResult(null);
                setStep(1);
              }}
            >
              {t.startOver}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
