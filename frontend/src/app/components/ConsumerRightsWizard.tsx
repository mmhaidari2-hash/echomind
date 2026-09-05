"use client";

import { useState } from "react";

import { rightsText } from "../lib/consumerRightsCopy";
import type { Locale } from "../lib/direction";
import {
  ApiError,
  parseDocumentFile,
  submitConsumerRightsNotice,
  type ConsumerRightsPrefill,
  type ConsumerRightsResponse,
  type DesiredRemedy,
  type PriorRemedy,
  type PurchaseKind,
  type WatchPayload,
} from "@/services/api";

type WizardStep = 1 | 2 | 3;

type ConsumerRightsWizardProps = {
  locale: Locale;
  onClose: () => void;
  prefill?: ConsumerRightsPrefill | null;
  onTracked?: (watch: WatchPayload) => void;
};

const fieldClass =
  "w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-[16px] text-slate-100 placeholder:text-slate-500 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-400/40";

function money(value: string | number): string {
  const amount = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(amount)) return String(value);
  return `£${amount.toFixed(2)}`;
}

export default function ConsumerRightsWizard({
  locale,
  onClose,
  prefill,
  onTracked,
}: ConsumerRightsWizardProps) {
  const t = rightsText(locale);
  const [step, setStep] = useState<WizardStep>(1);
  const [retailer, setRetailer] = useState(prefill?.retailer_name ?? "");
  const [retailerAddress, setRetailerAddress] = useState("");
  const [consumer, setConsumer] = useState("");
  const [item, setItem] = useState(prefill?.item_description ?? "");
  const [kind, setKind] = useState<PurchaseKind>("goods");
  const [purchaseDate, setPurchaseDate] = useState(prefill?.purchase_date ?? "");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [price, setPrice] = useState(
    prefill?.purchase_price != null ? String(prefill.purchase_price) : "79.99",
  );
  const [orderRef, setOrderRef] = useState(prefill?.order_reference ?? "");
  const [fault, setFault] = useState("");
  const [prior, setPrior] = useState<PriorRemedy>("none");
  const [desired, setDesired] = useState<DesiredRemedy>("auto");
  const [proofName, setProofName] = useState(prefill?.proof_filename ?? "");
  const [result, setResult] = useState<ConsumerRightsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canContinuePurchase = retailer.trim() && item.trim() && purchaseDate && Number(price) > 0;
  const canGenerate = fault.trim().length >= 3;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const reply = await submitConsumerRightsNotice({
        retailer_name: retailer,
        retailer_address: retailerAddress || undefined,
        consumer_name: consumer || undefined,
        item_description: item,
        purchase_kind: kind,
        purchase_date: purchaseDate,
        delivery_date: deliveryDate || undefined,
        purchase_price: Number(price),
        order_reference: orderRef || undefined,
        fault_description: fault,
        prior_remedy: prior,
        desired_remedy: desired,
        proof_filename: proofName || undefined,
        locale,
      });
      setResult(reply);
      setStep(3);
      onTracked?.({
        kind: "purchase",
        title: `${reply.retailer_name} · ${reply.item_description}`,
        anchor_date: deliveryDate || purchaseDate || undefined,
        amount: Number(reply.purchase_price),
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
          <p className="text-[11px] uppercase tracking-[0.2em] text-violet-300/80">{t.subtitle}</p>
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
        {[t.stepPurchase, t.stepFault, t.stepNotice].map((label, index) => {
          const current = (index + 1) as WizardStep;
          const active = step === current;
          const done = step > current;
          return (
            <li
              key={label}
              className={`rounded-full border px-2 py-1.5 ${
                active
                  ? "border-violet-500/40 bg-violet-400/10 text-violet-200"
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
            {t.retailer}
            <input className={fieldClass} value={retailer} onChange={(e) => setRetailer(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.retailerAddress}
            <input
              className={fieldClass}
              value={retailerAddress}
              onChange={(e) => setRetailerAddress(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.item}
            <input className={fieldClass} value={item} onChange={(e) => setItem(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.kind}
            <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value as PurchaseKind)}>
              <option value="goods">{t.goods}</option>
              <option value="digital">{t.digital}</option>
              <option value="services">{t.services}</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm text-slate-300">
              {t.purchaseDate}
              <input
                type="date"
                className={fieldClass}
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm text-slate-300">
              {t.deliveryDate}
              <input
                type="date"
                className={fieldClass}
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.price}
            <input
              type="number"
              min={0.01}
              step={0.01}
              className={fieldClass}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.consumer}
            <input className={fieldClass} value={consumer} onChange={(e) => setConsumer(e.target.value)} />
          </label>
          <button
            type="button"
            className="mt-1 rounded-2xl border border-violet-500/30 bg-violet-400/15 px-4 py-3 text-sm font-semibold text-violet-100 disabled:opacity-40"
            disabled={!canContinuePurchase}
            onClick={() => setStep(2)}
          >
            {t.next}
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.orderRef}
            <input className={fieldClass} value={orderRef} onChange={(e) => setOrderRef(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.fault}
            <textarea
              rows={4}
              className={`${fieldClass} resize-none leading-6`}
              value={fault}
              onChange={(e) => setFault(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.prior}
            <select className={fieldClass} value={prior} onChange={(e) => setPrior(e.target.value as PriorRemedy)}>
              <option value="none">{t.priorNone}</option>
              <option value="repair_attempted">{t.priorRepair}</option>
              <option value="replacement_attempted">{t.priorReplace}</option>
              <option value="trader_refused">{t.priorRefused}</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm text-slate-300">
            {t.desired}
            <select className={fieldClass} value={desired} onChange={(e) => setDesired(e.target.value as DesiredRemedy)}>
              <option value="auto">{t.desiredAuto}</option>
              <option value="refund">{t.desiredRefund}</option>
              <option value="repair">{t.desiredRepair}</option>
              <option value="replacement">{t.desiredReplace}</option>
              <option value="price_reduction">{t.desiredReduction}</option>
            </select>
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
                  const fill = parsed.consumer_rights;
                  if (!fill) return;
                  if (!retailer && fill.retailer_name) setRetailer(fill.retailer_name);
                  if (!item && fill.item_description) setItem(fill.item_description);
                  if (!purchaseDate && fill.purchase_date) setPurchaseDate(fill.purchase_date);
                  if (fill.purchase_price != null) setPrice(String(fill.purchase_price));
                  if (!orderRef && fill.order_reference) setOrderRef(fill.order_reference);
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
              className="rounded-2xl border border-violet-500/30 bg-violet-400/15 px-4 py-3 text-sm font-semibold text-violet-100 disabled:opacity-40"
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
          <div className="rounded-2xl border border-violet-500/25 bg-violet-400/10 px-4 py-3 text-violet-100">
            <p className="text-xs uppercase tracking-[0.16em] opacity-80">{t.eligible}</p>
            <p className="mt-1 text-xl font-semibold">{result.pathway_label}</p>
            <p className="mt-1 text-sm opacity-90">
              {t.days}: {result.days_since_delivery} · {result.recommended_remedy.replace("_", " ")} ·{" "}
              {money(result.purchase_price)}
            </p>
          </div>
          <p className="text-sm text-slate-200">{result.summary}</p>
          <p className="text-sm text-slate-400">
            {result.within_6_months ? t.burden : t.burdenYou}
          </p>
          <p className="text-sm text-slate-400">
            <span className="text-slate-500">{t.guideline}: </span>
            {result.guideline}
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
              className="rounded-2xl border border-violet-500/30 bg-violet-400/15 px-4 py-3 text-sm font-semibold text-violet-100"
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
