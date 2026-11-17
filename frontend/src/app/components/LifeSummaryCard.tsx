"use client";

import { useState } from "react";

import {
  ApiError,
  createLifeObligation,
  createLifePromise,
  updateLifeObligationStatus,
  updateLifePromiseStatus,
  type LifeSnapshot,
} from "@/services/api";
import type { Locale } from "../lib/direction";

const fieldClass =
  "w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-[16px] text-slate-100";

export default function LifeSummaryCard({
  locale,
  snapshot,
  onChanged,
}: {
  locale: Locale;
  snapshot: LifeSnapshot | null;
  onChanged: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"idle" | "obligation" | "promise">("idle");
  const [title, setTitle] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [promise, setPromise] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!snapshot) return null;

  const overdue = snapshot.obligations.filter((item) => item.status === "overdue").length;
  const dueSoon = snapshot.obligations.filter((item) => item.status === "due_soon").length;
  const openPromises = snapshot.promises.filter((item) => item.status === "open").length;

  const resetForm = () => {
    setMode("idle");
    setTitle("");
    setCounterparty("");
    setPromise("");
    setDueDate("");
    setError(null);
  };

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
      await onChanged();
      resetForm();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : locale === "fa" ? "ذخیره نشد." : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[1.4rem] border border-metal-line bg-navy p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300/80">
          {locale === "fa" ? "زندگی من" : "My life"}
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            className="min-h-9 rounded-full border border-sky-500/30 px-3 text-[11px] font-semibold text-sky-100"
            onClick={() => {
              setMode("obligation");
              setError(null);
            }}
          >
            {locale === "fa" ? "مهلت +" : "Deadline +"}
          </button>
          <button
            type="button"
            className="min-h-9 rounded-full border border-violet-500/30 px-3 text-[11px] font-semibold text-violet-100"
            onClick={() => {
              setMode("promise");
              setError(null);
            }}
          >
            {locale === "fa" ? "قول +" : "Promise +"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3">
          <p className="text-xl font-semibold text-rose-200">{overdue}</p>
          <p className="mt-1 text-[11px] text-slate-400">{locale === "fa" ? "عقب‌افتاده" : "Overdue"}</p>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3">
          <p className="text-xl font-semibold text-amber-200">{dueSoon}</p>
          <p className="mt-1 text-[11px] text-slate-400">{locale === "fa" ? "نزدیک" : "Due soon"}</p>
        </div>
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-3">
          <p className="text-xl font-semibold text-sky-200">{openPromises}</p>
          <p className="mt-1 text-[11px] text-slate-400">{locale === "fa" ? "قول باز" : "Promises"}</p>
        </div>
      </div>

      {mode === "obligation" ? (
        <div className="mt-3 space-y-2 rounded-2xl border border-slate-800 p-3">
          <input
            className={fieldClass}
            value={title}
            placeholder={locale === "fa" ? "چه کاری باید انجام شود؟" : "What needs to be done?"}
            onChange={(event) => setTitle(event.target.value)}
          />
          <input
            className={fieldClass}
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !title.trim()}
              className="min-h-10 rounded-full bg-sky-300 px-4 text-xs font-semibold text-slate-950 disabled:opacity-50"
              onClick={() =>
                void run(() =>
                  createLifeObligation({
                    title: title.trim(),
                    due_date: dueDate || null,
                    source: "user",
                  }),
                )
              }
            >
              {locale === "fa" ? "ثبت مهلت" : "Save deadline"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-10 rounded-full border border-slate-700 px-4 text-xs font-semibold text-slate-300"
              onClick={resetForm}
            >
              {locale === "fa" ? "لغو" : "Cancel"}
            </button>
          </div>
        </div>
      ) : null}

      {mode === "promise" ? (
        <div className="mt-3 space-y-2 rounded-2xl border border-slate-800 p-3">
          <input
            className={fieldClass}
            value={counterparty}
            placeholder={locale === "fa" ? "چه کسی / چه شرکتی؟" : "Who made the promise?"}
            onChange={(event) => setCounterparty(event.target.value)}
          />
          <textarea
            className={fieldClass}
            value={promise}
            rows={3}
            placeholder={locale === "fa" ? "چه قولی داده شد؟" : "What was promised?"}
            onChange={(event) => setPromise(event.target.value)}
          />
          <input
            className={fieldClass}
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !counterparty.trim() || !promise.trim()}
              className="min-h-10 rounded-full bg-violet-300 px-4 text-xs font-semibold text-slate-950 disabled:opacity-50"
              onClick={() =>
                void run(() =>
                  createLifePromise({
                    counterparty: counterparty.trim(),
                    promise: promise.trim(),
                    due_date: dueDate || null,
                  }),
                )
              }
            >
              {locale === "fa" ? "ثبت قول" : "Save promise"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-10 rounded-full border border-slate-700 px-4 text-xs font-semibold text-slate-300"
              onClick={resetForm}
            >
              {locale === "fa" ? "لغو" : "Cancel"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p> : null}

      {snapshot.obligations.length || snapshot.promises.length ? (
        <div className="mt-3 space-y-2">
          {snapshot.obligations.slice(0, 5).map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-800 px-3 py-2">
              <p className="text-xs font-medium text-slate-200">{item.title}</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-[11px] text-slate-500">
                  {item.status.replace("_", " ")}
                  {item.due_date ? ` · ${item.due_date}` : ""}
                </p>
                {item.status !== "completed" && item.status !== "cancelled" ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="text-[11px] font-semibold text-emerald-300 disabled:opacity-50"
                    onClick={() => void run(() => updateLifeObligationStatus(item.id, "completed"))}
                  >
                    {locale === "fa" ? "انجام شد" : "Done"}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {snapshot.promises.slice(0, 5).map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-800 px-3 py-2">
              <p className="text-xs font-medium text-slate-200">{item.counterparty}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{item.promise}</p>
              {item.status === "open" ? (
                <div className="mt-1.5 flex gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    className="text-[11px] font-semibold text-emerald-300 disabled:opacity-50"
                    onClick={() => void run(() => updateLifePromiseStatus(item.id, "kept"))}
                  >
                    {locale === "fa" ? "عمل شد" : "Kept"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="text-[11px] font-semibold text-rose-300 disabled:opacity-50"
                    onClick={() => void run(() => updateLifePromiseStatus(item.id, "broken"))}
                  >
                    {locale === "fa" ? "عمل نشد" : "Broken"}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          {locale === "fa" ? "هنوز مهلت یا قولی ثبت نشده." : "No obligations or promises yet."}
        </p>
      )}
    </section>
  );
}
