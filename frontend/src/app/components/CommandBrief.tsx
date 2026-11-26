"use client";

/**
 * Today's Command Brief — the proactive home surface (mockup 3).
 *
 * Instead of a passive welcome, the home screen shows what needs the
 * owner right now: delegated tasks waiting for approval, train delays
 * the inbox already detected, outcomes waiting to be verified, and
 * the morning brief. Every row is bound to a real live backend
 * state — outcomes queue, Inbox Watch detections, delegation tasks,
 * morning brief — and every action is a real one (Approve & Run,
 * Add, Verify, Dismiss). Nothing is faked: when there is nothing,
 * the card says so honestly, and when the backend is an older build
 * that does not have these endpoints yet, it says the brief arrives
 * with the next app update.
 */

import { useCallback, useState } from "react";

import { Cascade, GlassCard } from "./Glass";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import {
  ApiError,
  confirmAction,
  confirmProjectTask,
  dismissDetectionProposal,
  getMorningBrief,
  getPendingOutcomes,
  isEndpointMissing,
  listProjects,
  listProjectTasks,
  proposeAction,
  scanInboxForDeadlines,
  verifyOutcome,
  type DelegatedTask,
  type DetectionProposal,
  type OutcomeItem,
  type PillarId,
} from "@/services/api";
import type { Locale } from "../lib/direction";

type Lang = "en" | "fa";

type RowAction = "approve" | "add" | "verify" | null;

type BriefRow = {
  id: string;
  kind: "delegation" | "detection" | "outcome" | "info";
  title: string;
  reason: string;
  due?: string | null;
  pillar?: PillarId;
  action: RowAction;
  task?: DelegatedTask;
  proposal?: DetectionProposal;
  outcome?: OutcomeItem;
};

const STRINGS = {
  eyebrow: { en: "Today's brief", fa: "خلاصهٔ امروز" },
  allClear: {
    en: "All clear — nothing needs you right now.",
    fa: "همه‌چیز مرتب است — الان چیزی به شما نیاز ندارد.",
  },
  allClearHint: {
    en: "New deadlines, delays and approvals will appear here.",
    fa: "مهلت‌ها، تأخیرها و تأییدهای جدید اینجا ظاهر می‌شوند.",
  },
  outdated: {
    en: "Today's brief arrives with the next app update — the server still runs the older version.",
    fa: "خلاصهٔ امروز با به‌روزرسانی بعدی برنامه می‌آید — سرور هنوز نسخهٔ قدیمی را اجرا می‌کند.",
  },
  connectGoogle: {
    en: "Connect Gmail and EchoMind will watch your inbox for delays, refunds and renewals.",
    fa: "جیمیل را وصل کنید تا اکومایند صندوق شما را برای تأخیر، بازپرداخت و تمدید زیر نظر بگیرد.",
  },
  approveRun: { en: "Approve & Run", fa: "تأیید و اجرا" },
  add: { en: "Add", fa: "اضافه کن" },
  dismiss: { en: "Dismiss", fa: "رد کن" },
  verify: { en: "Verify", fa: "بررسی" },
  edit: { en: "Edit", fa: "ویرایش" },
  running: { en: "Running…", fa: "در حال اجرا…" },
  verified: { en: "Verified", fa: "تأیید شد" },
  awaiting: { en: "Awaiting evidence", fa: "در انتظار مدرک" },
  failed: { en: "Did not happen", fa: "اتفاق نیفتاد" },
  actionFailed: {
    en: "That action did not run. Try again.",
    fa: "این اقدام اجرا نشد. دوباره تلاش کنید.",
  },
} as const;

function pillarForDetection(kind: DetectionProposal["kind"]): PillarId {
  return kind === "delay_repay" ? "delay_repay" : "consumer_rights";
}

export default function CommandBrief({
  locale,
  onOpenPillar,
}: {
  locale: Lang;
  /** Opens the wizard for a brief row (Edit). */
  onOpenPillar: (pillar: PillarId) => void;
}) {
  const [rows, setRows] = useState<BriefRow[] | null>(null);
  const [outdated, setOutdated] = useState(false);
  const [googleMissing, setGoogleMissing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [outcomes, brief, projects, scan] = await Promise.allSettled([
      getPendingOutcomes(),
      getMorningBrief(locale),
      (async () => {
        const list = await listProjects();
        const tasks: DelegatedTask[] = [];
        for (const project of list) {
          try {
            tasks.push(...(await listProjectTasks(project.id)));
          } catch {
            // One project's tasks failing must not hide the rest.
          }
        }
        return tasks;
      })(),
      scanInboxForDeadlines(20),
    ]);

    const next: BriefRow[] = [];
    let missing = 0;
    let failed = 0;

    if (outcomes.status === "fulfilled") {
      for (const item of outcomes.value) {
        next.push({
          id: `outcome:${item.id}`,
          kind: "outcome",
          title: item.title,
          reason: item.reason,
          due: item.due_date,
          action: "verify",
          outcome: item,
        });
      }
    } else {
      failed += 1;
      if (isEndpointMissing(outcomes.reason)) missing += 1;
    }

    if (brief.status === "fulfilled") {
      for (const item of brief.value.items.slice(0, 3)) {
        const pillar: PillarId =
          item.kind === "delay_repay"
            ? "delay_repay"
            : item.kind === "overdraft"
              ? "overdraft_shield"
              : "consumer_rights";
        next.push({
          id: `brief:${item.kind}:${item.title}`,
          kind: "info",
          title: item.title,
          reason: item.reason,
          due: item.due_date,
          pillar,
          action: null,
        });
      }
    } else {
      failed += 1;
      if (isEndpointMissing(brief.reason)) missing += 1;
    }

    if (projects.status === "fulfilled") {
      for (const task of projects.value) {
        if (task.status !== "proposed") continue;
        next.push({
          id: `task:${task.id}`,
          kind: "delegation",
          title: task.instruction,
          reason:
            locale === "fa" ? "برنامه آمادهٔ بررسی است" : "Plan ready for review",
          action: "approve",
          task,
        });
      }
    } else {
      failed += 1;
      if (isEndpointMissing(projects.reason)) missing += 1;
    }

    if (scan.status === "fulfilled") {
      setGoogleMissing(false);
      for (const proposal of scan.value.proposals.filter((p) => p.status === "new")) {
        next.push({
          id: `detection:${proposal.id}`,
          kind: "detection",
          title: proposal.title,
          reason: proposal.reason,
          due: proposal.due_date,
          pillar: pillarForDetection(proposal.kind),
          action: "add",
          proposal,
        });
      }
    } else {
      failed += 1;
      if (isEndpointMissing(scan.reason)) {
        missing += 1;
      } else if (scan.reason instanceof ApiError && scan.reason.status === 409) {
        setGoogleMissing(true);
      }
    }

    // Delegated approvals first, then detections, then outcomes, then info.
    const order: Record<BriefRow["kind"], number> = {
      delegation: 0,
      detection: 1,
      outcome: 2,
      info: 3,
    };
    next.sort((a, b) => order[a.kind] - order[b.kind]);
    setRows(next.slice(0, 6));
    setOutdated(failed > 0 && missing === failed);
  }, [locale]);

  useLiveRefresh(load, { intervalMs: 45_000 });

  const removeRow = (id: string) =>
    setRows((prev) => (prev ? prev.filter((row) => row.id !== id) : prev));

  const runApprove = async (row: BriefRow) => {
    if (!row.task) return;
    setBusyId(row.id);
    setError(null);
    try {
      await confirmProjectTask(row.task.id);
      removeRow(row.id);
    } catch {
      setError(STRINGS.actionFailed[locale]);
    } finally {
      setBusyId(null);
    }
  };

  const runAdd = async (row: BriefRow) => {
    const proposal = row.proposal;
    if (!proposal) return;
    setBusyId(row.id);
    setError(null);
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
      removeRow(row.id);
    } catch {
      setError(STRINGS.actionFailed[locale]);
    } finally {
      setBusyId(null);
    }
  };

  const runDismiss = async (row: BriefRow) => {
    const proposal = row.proposal;
    if (!proposal) return;
    setBusyId(row.id);
    try {
      await dismissDetectionProposal(proposal.id);
      removeRow(row.id);
    } catch {
      setError(STRINGS.actionFailed[locale]);
    } finally {
      setBusyId(null);
    }
  };

  const runVerify = async (row: BriefRow) => {
    const outcome = row.outcome;
    if (!outcome) return;
    setBusyId(row.id);
    try {
      const result = await verifyOutcome(outcome.kind === "promise_verification" ? "promise" : "obligation", outcome.source_id);
      setVerdict((prev) => ({ ...prev, [row.id]: result.status }));
    } catch {
      setError(STRINGS.actionFailed[locale]);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-label={STRINGS.eyebrow[locale]} className="w-full">
      <p className="echomind-meta text-gold">{STRINGS.eyebrow[locale]}</p>
      <div className="mt-2">
        {rows === null ? (
          <GlassCard className="p-4">
            <p className="text-sm text-muted">…</p>
          </GlassCard>
        ) : outdated ? (
          <GlassCard className="p-4">
            <p className="text-sm leading-relaxed text-ink-soft">{STRINGS.outdated[locale]}</p>
          </GlassCard>
        ) : rows.length === 0 ? (
          <GlassCard className="p-4">
            <p className="text-sm font-semibold text-ink">{STRINGS.allClear[locale]}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{STRINGS.allClearHint[locale]}</p>
            {googleMissing ? (
              <p className="mt-2 text-xs leading-relaxed text-muted">{STRINGS.connectGoogle[locale]}</p>
            ) : null}
          </GlassCard>
        ) : (
          <Cascade className="echomind-waterfall-offset grid gap-3" staggerMs={40}>
            {rows.map((row) => (
              <GlassCard key={row.id} className="rounded-[1.6rem] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold leading-snug text-ink">{row.title}</p>
                    <p className="mt-1 truncate text-sm text-muted">
                      {row.reason}
                      {row.due ? ` · ${row.due}` : ""}
                    </p>
                    {verdict[row.id] ? (
                      <p className="mt-1 text-xs font-semibold text-emerald-300">
                        {verdict[row.id] === "verified"
                          ? STRINGS.verified[locale]
                          : verdict[row.id] === "failed"
                            ? STRINGS.failed[locale]
                            : STRINGS.awaiting[locale]}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {row.pillar ? (
                      <button
                        type="button"
                        onClick={() => onOpenPillar(row.pillar!)}
                        className="min-h-11 rounded-full border border-white/[0.09] px-3.5 text-xs font-semibold text-ink-soft"
                      >
                        {STRINGS.edit[locale]}
                      </button>
                    ) : null}
                    {row.action === "approve" ? (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void runApprove(row)}
                        className="echomind-gold-btn min-h-11 px-4 text-sm font-bold disabled:opacity-60"
                      >
                        {busyId === row.id ? STRINGS.running[locale] : STRINGS.approveRun[locale]}
                      </button>
                    ) : null}
                    {row.action === "add" ? (
                      <>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void runAdd(row)}
                          className="echomind-gold-btn min-h-11 px-4 text-sm font-bold disabled:opacity-60"
                        >
                          {busyId === row.id ? STRINGS.running[locale] : STRINGS.add[locale]}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void runDismiss(row)}
                          className="min-h-11 rounded-full border border-white/[0.09] px-3.5 text-xs font-semibold text-muted"
                        >
                          {STRINGS.dismiss[locale]}
                        </button>
                      </>
                    ) : null}
                    {row.action === "verify" ? (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void runVerify(row)}
                        className="echomind-gold-btn min-h-11 px-4 text-sm font-bold disabled:opacity-60"
                      >
                        {busyId === row.id ? STRINGS.running[locale] : STRINGS.verify[locale]}
                      </button>
                    ) : null}
                  </div>
                </div>
              </GlassCard>
            ))}
          </Cascade>
        )}
        {error ? (
          <p role="alert" className="mt-2 text-xs text-red-300">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
