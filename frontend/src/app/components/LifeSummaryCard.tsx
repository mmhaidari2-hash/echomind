"use client";

import { useEffect, useState } from "react";

import {
  ApiError,
  confirmAction,
  createLifeObligation,
  createLifePromise,
  dismissDetectionProposal,
  draftPromiseFollowup,
  getMorningBrief,
  getPendingOutcomes,
  proposeAction,
  scanInboxForDeadlines,
  updateLifeObligationStatus,
  updateLifePromiseStatus,
  verifyOutcome,
  type DetectionProposal,
  type FollowupDraftResponse,
  type LifeSnapshot,
  type MorningBrief,
  type OutcomeItem,
  type VerificationResult,
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
  const [proposals, setProposals] = useState<DetectionProposal[]>([]);
  const [scanState, setScanState] = useState<"idle" | "scanning" | "done">("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<OutcomeItem[] | null>(null);
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [followup, setFollowup] = useState<Record<string, FollowupDraftResponse>>({});
  const [followupTo, setFollowupTo] = useState<Record<string, string>>({});
  const [verifications, setVerifications] = useState<Record<string, VerificationResult>>({});

  useEffect(() => {
    let cancelled = false;
    void getMorningBrief(locale)
      .then((rows) => {
        if (!cancelled) setBrief(rows);
      })
      .catch(() => {
        if (!cancelled) setBrief(null);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    void getPendingOutcomes()
      .then((rows) => {
        if (!cancelled) setOutcomes(rows);
      })
      .catch(() => {
        if (!cancelled) setOutcomes(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const refreshOutcomes = async () => {
    try {
      setOutcomes(await getPendingOutcomes());
    } catch {
      setOutcomes(null);
    }
  };

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
      await onChanged();
      await refreshOutcomes();
      resetForm();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : locale === "fa" ? "ذخیره نشد." : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const scanInbox = async () => {
    setScanState("scanning");
    setScanError(null);
    try {
      const result = await scanInboxForDeadlines();
      setProposals(result.proposals.filter((item) => item.status === "new"));
      setScanState("done");
    } catch (cause) {
      setScanState("idle");
      if (cause instanceof ApiError && cause.status === 409) {
        setScanError(locale === "fa" ? "اول گوگل را وصل کنید." : "Connect Google first.");
      } else if (cause instanceof ApiError && cause.status === 503) {
        setScanError(locale === "fa" ? "اتصال گوگل تنظیم نشده." : "Google connection is not set up.");
      } else {
        setScanError(
          cause instanceof ApiError
            ? cause.message
            : locale === "fa"
              ? "بررسی صندوق ناموفق بود."
              : "Inbox check failed.",
        );
      }
    }
  };

  const acceptProposal = async (proposal: DetectionProposal) => {
    setBusy(true);
    setScanError(null);
    try {
      const parameters =
        proposal.target === "promise"
          ? {
              counterparty: proposal.counterparty ?? "",
              promise: proposal.promise_text ?? proposal.title,
              due_date: proposal.due_date ?? null,
              evidence_ids: [proposal.evidence_message_id],
            }
          : {
              title: proposal.title,
              due_date: proposal.due_date ?? null,
              source: "gmail",
              notes: proposal.notes ?? proposal.reason,
              evidence_ids: [proposal.evidence_message_id],
            };
      const action = await proposeAction({
        tool: proposal.target === "promise" ? "life.create_promise" : "life.create_obligation",
        summary: proposal.title,
        parameters,
        evidence_ids: [proposal.evidence_message_id],
        idempotency_key: proposal.id,
      });
      await confirmAction(action.id);
      setProposals((rows) => rows.filter((item) => item.id !== proposal.id));
      await onChanged();
      await refreshOutcomes();
    } catch (cause) {
      setScanError(
        cause instanceof ApiError ? cause.message : locale === "fa" ? "ثبت نشد." : "Could not save.",
      );
    } finally {
      setBusy(false);
    }
  };

  const dismissProposal = async (proposal: DetectionProposal) => {
    setBusy(true);
    try {
      await dismissDetectionProposal(proposal.id);
      setProposals((rows) => rows.filter((item) => item.id !== proposal.id));
    } catch (cause) {
      setScanError(
        cause instanceof ApiError ? cause.message : locale === "fa" ? "رد نشد." : "Could not dismiss.",
      );
    } finally {
      setBusy(false);
    }
  };

  const loadFollowup = async (promiseId: string) => {
    setBusy(true);
    setError(null);
    try {
      const draft = await draftPromiseFollowup(promiseId, "chase", { locale });
      setFollowup((rows) => ({ ...rows, [promiseId]: draft }));
      setFollowupTo((rows) => ({ ...rows, [promiseId]: draft.draft.to }));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : locale === "fa" ? "پیش‌نویس ساخته نشد." : "Could not draft the follow-up.");
    } finally {
      setBusy(false);
    }
  };

  const sendFollowup = async (promiseId: string) => {
    const draft = followup[promiseId];
    if (!draft) return;
    const to = (followupTo[promiseId] ?? "").trim();
    if (!to) {
      setError(locale === "fa" ? "گیرنده را وارد کنید." : "Add the recipient first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const action = await proposeAction({
        tool: "gmail.send",
        summary: draft.draft.subject,
        parameters: { to, subject: draft.draft.subject, body: draft.draft.body },
        evidence_ids: draft.authority_proposal.evidence_ids ?? [],
        idempotency_key: draft.authority_proposal.idempotency_key,
      });
      await confirmAction(action.id);
      setFollowup((rows) => {
        const next = { ...rows };
        delete next[promiseId];
        return next;
      });
      await onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : locale === "fa" ? "ارسال نشد." : "Could not send.");
    } finally {
      setBusy(false);
    }
  };

  const verifyRecord = async (kind: "obligation" | "promise", sourceId: string) => {
    setBusy(true);
    try {
      const result = await verifyOutcome(kind, sourceId);
      setVerifications((rows) => ({ ...rows, [sourceId]: result }));
    } catch {
      // Verification needs Gmail; a failure leaves the row unchanged and
      // the brief/outcomes still show the record as open.
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="echomind-glass rounded-[1.4rem] border border-metal-line bg-navy p-4">
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
          <button
            type="button"
            className="min-h-9 rounded-full border border-emerald-500/30 px-3 text-[11px] font-semibold text-emerald-100"
            disabled={scanState === "scanning"}
            onClick={() => void scanInbox()}
          >
            {scanState === "scanning"
              ? locale === "fa"
                ? "در حال بررسی…"
                : "Checking…"
              : locale === "fa"
                ? "بررسی صندوق"
                : "Check inbox"}
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

      {brief && brief.items.length ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300/80">
            {locale === "fa" ? "امروز" : "Today"}
          </p>
          {brief.items.slice(0, 3).map((item) => (
            <div key={`${item.kind}-${item.title}`} className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2">
              <p className="text-xs font-medium text-slate-200">{item.title}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {item.reason}
                {item.due_date ? ` · ${item.due_date}` : ""}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {outcomes && outcomes.length ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">
            {locale === "fa" ? "نیاز به پیگیری" : "Needs follow-up"}
          </p>
          {outcomes.slice(0, 5).map((item) => (
            <div key={item.id} className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <p className="text-xs font-medium text-slate-200">{item.title}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {item.reason}
                {item.due_date ? ` · ${item.due_date}` : ""}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {scanState === "done" ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
            {locale === "fa" ? "از صندوق پیدا شد" : "Found in your inbox"}
          </p>
          {proposals.length === 0 ? (
            <p className="text-xs text-slate-500">
              {locale === "fa"
                ? "در ۳۰ روز گذشته مهلت تازه‌ای پیدا نشد."
                : "No new deadlines found in the last 30 days."}
            </p>
          ) : (
            proposals.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-800 px-3 py-2">
                <p className="text-xs font-medium text-slate-200">{item.title}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{item.reason}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {item.evidence_sender}
                  {item.due_date ? ` · ${item.due_date}` : ""}
                  {item.due_date_estimated ? (locale === "fa" ? " (تخمینی)" : " (estimated)") : ""}
                </p>
                <div className="mt-1.5 flex gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    className="text-[11px] font-semibold text-emerald-300 disabled:opacity-50"
                    onClick={() => void acceptProposal(item)}
                  >
                    {locale === "fa" ? "اضافه کن" : "Add"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="text-[11px] font-semibold text-slate-400 disabled:opacity-50"
                    onClick={() => void dismissProposal(item)}
                  >
                    {locale === "fa" ? "رد کن" : "Dismiss"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {scanError ? (
        <p role="alert" className="mt-2 text-xs text-rose-300">
          {scanError}
        </p>
      ) : null}

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
                  {verifications[item.id]
                    ? ` · ${
                        verifications[item.id].status === "verified"
                          ? locale === "fa"
                            ? "تأیید شد"
                            : "verified"
                          : verifications[item.id].status === "failed"
                            ? locale === "fa"
                              ? "نشد"
                              : "did not happen"
                            : locale === "fa"
                              ? "در انتظار"
                              : "awaiting"
                      }`
                    : ""}
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    className="text-[11px] font-semibold text-sky-300 disabled:opacity-50"
                    onClick={() => void verifyRecord("obligation", item.id)}
                  >
                    {locale === "fa" ? "بررسی" : "Verify"}
                  </button>
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
                  <button
                    type="button"
                    disabled={busy}
                    className="text-[11px] font-semibold text-sky-300 disabled:opacity-50"
                    onClick={() => void loadFollowup(item.id)}
                  >
                    {locale === "fa" ? "پیگیری" : "Follow up"}
                  </button>
                </div>
              ) : null}
              {followup[item.id] ? (
                <div className="mt-2 space-y-2 rounded-xl border border-slate-800 p-2">
                  <input
                    className={fieldClass}
                    value={followupTo[item.id] ?? ""}
                    placeholder={locale === "fa" ? "ایمیل گیرنده" : "Recipient email"}
                    onChange={(event) =>
                      setFollowupTo((rows) => ({ ...rows, [item.id]: event.target.value }))
                    }
                  />
                  <p className="text-[11px] text-slate-400">{followup[item.id].draft.subject}</p>
                  <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-500">
                    {followup[item.id].draft.body}
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={busy || !(followupTo[item.id] ?? "").trim()}
                      className="text-[11px] font-semibold text-emerald-300 disabled:opacity-50"
                      onClick={() => void sendFollowup(item.id)}
                    >
                      {locale === "fa" ? "ارسال" : "Send"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-[11px] font-semibold text-slate-400 disabled:opacity-50"
                      onClick={() =>
                        setFollowup((rows) => {
                          const next = { ...rows };
                          delete next[item.id];
                          return next;
                        })
                      }
                    >
                      {locale === "fa" ? "لغو" : "Cancel"}
                    </button>
                  </div>
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
