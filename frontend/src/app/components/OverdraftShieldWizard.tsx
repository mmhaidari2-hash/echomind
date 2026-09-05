"use client";

import { useState } from "react";

import { shieldText } from "../lib/overdraftShieldCopy";
import type { Locale } from "../lib/direction";
import {
  ApiError,
  parseDocumentFile,
  submitOverdraftShieldNotice,
  type AccountType,
  type OverdraftKind,
  type OverdraftPrefill,
  type OverdraftShieldResponse,
  type PriorComplaint,
  type WatchPayload,
} from "@/services/api";

type WizardStep = 1 | 2 | 3;

type OverdraftShieldWizardProps = {
  locale: Locale;
  onClose: () => void;
  prefill?: OverdraftPrefill | null;
  onTracked?: (watch: WatchPayload) => void;
};

const fieldClass =
  "w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-[16px] text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-400/40";

function money(value: string | number): string {
  const amount = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(amount)) return String(value);
  return `£${amount.toFixed(2)}`;
}

export default function OverdraftShieldWizard({
  locale,
  onClose,
  prefill,
  onTracked,
}: OverdraftShieldWizardProps) {
  const t = shieldText(locale);
  const [step, setStep] = useState<WizardStep>(1);
  const [bank, setBank] = useState(prefill?.bank_name ?? "");
  const [bankAddress, setBankAddress] = useState("");
  const [customer, setCustomer] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("current");
  const [kind, setKind] = useState<OverdraftKind>("unarranged");
  const [feeAmount, setFeeAmount] = useState(
    prefill?.fee_amount != null ? String(prefill.fee_amount) : "15.00",
  );
  const [feeDate, setFeeDate] = useState(prefill?.fee_date ?? "");
  const [last4, setLast4] = useState("");
  const [description, setDescription] = useState("");
  const [prior, setPrior] = useState<PriorComplaint>("none");
  const [struggling, setStruggling] = useState(false);
  const [proofName, setProofName] = useState(prefill?.proof_filename ?? "");
  const [result, setResult] = useState<OverdraftShieldResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const last4Ok = last4 === "" || /^\d{4}$/.test(last4);
  const canContinueAccount = bank.trim() && last4Ok;
  const canGenerate = description.trim().length >= 3 && Boolean(feeDate) && Number(feeAmount) > 0;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const reply = await submitOverdraftShieldNotice({
        bank_name: bank,
        bank_address: bankAddress || undefined,
        customer_name: customer || undefined,
        account_type: accountType,
        overdraft_kind: kind,
        fee_amount: Number(feeAmount),
        fee_date: feeDate,
        account_last4: last4 || undefined,
        fee_description: description,
        prior_complaint: prior,
        struggling,
        proof_filename: proofName || undefined,
        locale,
      });
      setResult(reply);
      setStep(3);
      onTracked?.({
        kind: "overdraft",
        title: `${reply.bank_name} · £${reply.fee_amount}`,
        anchor_date: feeDate || undefined,
        amount: Number(reply.fee_amount),
        locale,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.failed);
    } finally {
      setBusy(false);
    }
  };

  const copyDraft = async () => {
    if (!result?.notice_draft) return;
    try {
      await navigator.clipboard.writeText(result.notice_draft);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-[0_10px_30px_rgba(2,6,23,0.28)] backdrop-blur-xl sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300/80">{t.subtitle}</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-100">{t.title}</h2>
          <p className="mt-1 text-xs text-slate-400">{t.bands}</p>
        </div>
        <button
          type="button"
          className="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-400 hover:text-slate-100"
          onClick={onClose}
        >
          {t.close}
        </button>
      </div>

      <ol className="mb-5 grid grid-cols-3 gap-2 text-center text-[11px] font-medium">
        {[t.stepAccount, t.stepFee, t.stepNotice].map((label, index) => {
          const current = (index + 1) as WizardStep;
          const active = step === current;
          const done = step > current;
          return (
            <li
              key={label}
              className={`rounded-full border px-2 py-1.5 ${
                active
                  ? "border-emerald-500/40 bg-emerald-400/10 text-emerald-200"
                  : done
                    ? "border-slate-700 text-slate-300"
                    : "border-slate-800 text-slate-500"
              }`}
            >
              {label}
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.bank}
            <input className={fieldClass} value={bank} onChange={(e) => setBank(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.bankAddress}
            <input
              className={fieldClass}
              value={bankAddress}
              onChange={(e) => setBankAddress(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.accountType}
            <select
              className={fieldClass}
              value={accountType}
              onChange={(e) => setAccountType(e.target.value as AccountType)}
            >
              <option value="current">{t.current}</option>
              <option value="student">{t.student}</option>
              <option value="basic">{t.basic}</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.last4}
            <input
              className={fieldClass}
              inputMode="numeric"
              maxLength={4}
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.customer}
            <input className={fieldClass} value={customer} onChange={(e) => setCustomer(e.target.value)} />
          </label>
          <button
            type="button"
            className="mt-1 rounded-2xl border border-emerald-500/30 bg-emerald-400/15 px-4 py-3 text-sm font-semibold text-emerald-100 disabled:opacity-40"
            disabled={!canContinueAccount}
            onClick={() => setStep(2)}
          >
            {t.next}
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.overdraftKind}
            <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value as OverdraftKind)}>
              <option value="unarranged">{t.unarranged}</option>
              <option value="arranged">{t.arranged}</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm text-slate-300">
              {t.feeAmount}
              <input
                type="number"
                min={0.01}
                step={0.01}
                className={fieldClass}
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm text-slate-300">
              {t.feeDate}
              <input
                type="date"
                className={fieldClass}
                value={feeDate}
                onChange={(e) => setFeeDate(e.target.value)}
              />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.description}
            <textarea
              rows={4}
              className={`${fieldClass} resize-none leading-6`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.prior}
            <select
              className={fieldClass}
              value={prior}
              onChange={(e) => setPrior(e.target.value as PriorComplaint)}
            >
              <option value="none">{t.priorNone}</option>
              <option value="informal">{t.priorInformal}</option>
              <option value="formal_pending">{t.priorPending}</option>
              <option value="bank_refused">{t.priorRefused}</option>
              <option value="eight_weeks">{t.priorEightWeeks}</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-700 bg-slate-950"
              checked={struggling}
              onChange={(e) => setStruggling(e.target.checked)}
            />
            {t.struggling}
          </label>
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.proof}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="text-sm text-slate-400 file:me-3 file:rounded-full file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-slate-200"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setProofName(file?.name ?? "");
                if (!file) return;
                void parseDocumentFile(file, { locale }).then((parsed) => {
                  const fill = parsed.overdraft_shield;
                  if (!fill) return;
                  if (!bank && fill.bank_name) setBank(fill.bank_name);
                  if (fill.fee_amount != null) setFeeAmount(String(fill.fee_amount));
                  if (!feeDate && fill.fee_date) setFeeDate(fill.fee_date);
                });
              }}
            />
            {proofName ? <span className="text-xs text-slate-500">{proofName}</span> : null}
          </label>
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-2xl border border-slate-800 px-4 py-3 text-sm text-slate-300"
              onClick={() => setStep(1)}
            >
              {t.back}
            </button>
            <button
              type="button"
              className="rounded-2xl border border-emerald-500/30 bg-emerald-400/15 px-4 py-3 text-sm font-semibold text-emerald-100 disabled:opacity-40"
              disabled={!canGenerate || busy}
              onClick={() => void generate()}
            >
              {busy ? "…" : t.generate}
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 && result ? (
        <div className="grid gap-4">
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-400/10 px-4 py-3 text-emerald-100">
            <p className="text-xs uppercase tracking-[0.16em] opacity-80">{t.eligible}</p>
            <p className="mt-1 text-xl font-semibold">{result.pathway_label}</p>
            <p className="mt-1 text-sm opacity-90">
              {t.days}: {result.days_since_fee} · {result.overdraft_kind} · {money(result.fee_amount)}
            </p>
          </div>
          <p className="text-sm text-slate-200">{result.summary}</p>
          <p className="text-sm text-slate-400">{result.can_refer_fos ? t.fosReady : t.fosWait}</p>
          <p className="text-sm text-slate-400">
            <span className="text-slate-500">{t.guideline}: </span>
            {result.guideline}
          </p>
          <p className="text-xs text-slate-500">
            {t.fos}: {result.fos_url}
          </p>
          <ul className="space-y-1 text-xs text-slate-500">
            {result.statute_refs.map((ref) => (
              <li key={ref}>{ref}</li>
            ))}
          </ul>
          <ol className="space-y-1.5 ps-4 text-sm text-slate-300">
            {result.next_steps.map((stepText) => (
              <li key={stepText} className="list-decimal">
                {stepText}
              </li>
            ))}
          </ol>
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.draft}
            <textarea
              readOnly
              rows={10}
              className={`${fieldClass} resize-none text-sm leading-6`}
              value={result.notice_draft}
            />
          </label>
          <p className="text-xs text-slate-500">{t.disclaimer}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-2xl border border-slate-800 px-4 py-3 text-sm text-slate-200"
              onClick={() => void copyDraft()}
            >
              {copied ? t.copied : t.copyDraft}
            </button>
            <button
              type="button"
              className="rounded-2xl border border-emerald-500/30 bg-emerald-400/15 px-4 py-3 text-sm font-semibold text-emerald-100"
              onClick={() => {
                setResult(null);
                setStep(1);
              }}
            >
              {t.startOver}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
