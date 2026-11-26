"use client";

/**
 * DelegatedWork — the other half of the home screen's promise.
 *
 * The hub answers "what is connected"; this answers "what is it doing
 * for me". It surfaces the owner's projects and the tasks delegated to
 * EchoMind (the project registry + propose → confirm → run path with
 * allowlists and an evidence trail), and it makes delegating visible:
 * every project has a "Delegate" action that pre-fills the chat composer
 * below, so the owner types "go do this in my such-and-such project"
 * in Persian or English and EchoMind proposes a plan.
 *
 * Nothing runs without the owner's confirmation: a proposed task shows
 * its plan and a Confirm button. The confirm call runs the task through
 * Bounded Authority; the result and the evidence trail show here.
 *
 * Bilingual EN/FA.
 */

import { useCallback, useEffect, useState } from "react";

import { GlassCard, Reveal, SectionHeading } from "./Glass";
import {
  confirmProjectTask,
  listProjects,
  listProjectTasks,
  type DelegatedTask,
  type Project,
} from "@/services/api";

type Lang = "en" | "fa";

type ProjectWithTasks = {
  project: Project;
  tasks: DelegatedTask[];
};

const STRINGS = {
  eyebrow: { en: "Delegation", fa: "واگذاری کار" },
  title: { en: "What it's doing for me", fa: "چی داره برام انجام می‌ده" },
  subtitle: {
    en: "Like a human assistant: tell EchoMind in the chat below — “go do this in my project” — and it proposes a plan. Nothing runs until you confirm it.",
    fa: "مثل یک دستیار انسانی: در گفت‌وگوی پایین بگویید «برو تو فلان پروژه‌م این کار رو بکن» — اکومایند یک برنامه پیشنهاد می‌کند. هیچ کاری تا تأیید شما اجرا نمی‌شود.",
  },
  delegateTo: { en: "Delegate", fa: "واگذار کن" },
  noProjects: {
    en: "No projects yet. Add one from the chat — for example: “In my launcher project, fix the home screen.”",
    fa: "هنوز پروژه‌ای نیست. از گفت‌وگو اضافه کنید — مثلاً: «تو پروژهٔ لانچرم، صفحهٔ اصلی را درست کن.»",
  },
  noTasks: { en: "No delegated tasks yet.", fa: "هنوز کاری واگذار نشده است." },
  needsConfirmation: { en: "Needs your confirmation", fa: "نیاز به تأیید شما" },
  confirm: { en: "Confirm and run", fa: "تأیید و اجرا" },
  confirming: { en: "Running…", fa: "در حال اجرا…" },
  running: { en: "Running", fa: "در حال اجرا" },
  done: { en: "Done", fa: "انجام شد" },
  failed: { en: "Failed", fa: "ناموفق" },
  needsYou: { en: "Needs you", fa: "نیاز به شما دارد" },
  proposed: { en: "Proposed", fa: "پیشنهاد شده" },
  steps: {
    en: (done: number, total: number) => `${done}/${total} steps done`,
    fa: (done: number, total: number) => `${done} از ${total} مرحله انجام شد`,
  },
  evidence: { en: "Evidence", fa: "مدرک" },
  result: { en: "Result", fa: "نتیجه" },
  refresh: { en: "Refresh", fa: "به‌روزرسانی" },
  loadFailed: {
    en: "Could not load your projects. Sign in and try again.",
    fa: "پروژه‌ها بارگذاری نشدند. وارد شوید و دوباره تلاش کنید.",
  },
  confirmFailed: {
    en: "Could not run that task. Try again from the chat.",
    fa: "اجرای آن کار ممکن نشد. از گفت‌وگو دوباره تلاش کنید.",
  },
} as const;

function statusLabel(status: string, lang: Lang): string {
  switch (status) {
    case "proposed":
      return STRINGS.proposed[lang];
    case "running":
      return STRINGS.running[lang];
    case "done":
      return STRINGS.done[lang];
    case "failed":
      return STRINGS.failed[lang];
    case "needs_owner":
      return STRINGS.needsYou[lang];
    default:
      return status;
  }
}

function statusTone(status: string): string {
  switch (status) {
    case "done":
      return "bg-emerald-600/15 text-emerald-700 border-emerald-600/30";
    case "running":
      return "bg-honey/10 text-honey-deep border-honey/40";
    case "failed":
      return "bg-rose-400/15 text-red-700 border-rose-300/30";
    case "needs_owner":
      return "bg-honey/15 text-honey-deep border-amber-300/30";
    default:
      return "bg-honey/15 text-honey-deep border-amber-300/30";
  }
}

export default function DelegatedWork({
  lang,
  onDelegateDraft,
}: {
  lang: Lang;
  /** Prefill the chat composer with a delegation sentence. */
  onDelegateDraft: (text: string) => void;
}) {
  const [projects, setProjects] = useState<ProjectWithTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listProjects();
      const withTasks = await Promise.all(
        list.map(async (project) => {
          try {
            return { project, tasks: await listProjectTasks(project.id) };
          } catch {
            return { project, tasks: [] as DelegatedTask[] };
          }
        }),
      );
      setProjects(withTasks);
    } catch {
      setError(STRINGS.loadFailed[lang]);
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    void load();
    window.addEventListener("echomind-auth-ready", load);
    return () => {
      window.removeEventListener("echomind-auth-ready", load);
    };
  }, [load]);

  const handleConfirm = async (taskId: string) => {
    setConfirmingId(taskId);
    setConfirmError(null);
    try {
      await confirmProjectTask(taskId);
      await load();
    } catch {
      setConfirmError(STRINGS.confirmFailed[lang]);
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <section aria-label={STRINGS.title[lang]} className="mt-8 w-full">
      <Reveal>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            eyebrow={STRINGS.eyebrow[lang]}
            title={STRINGS.title[lang]}
            subtitle={STRINGS.subtitle[lang]}
          />
          <button
            type="button"
            onClick={() => void load()}
            className="echomind-glass rounded-full px-3 py-1.5 text-xs font-semibold text-bark-soft transition hover:text-bark"
          >
            {STRINGS.refresh[lang]}
          </button>
        </div>
      </Reveal>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-clay">…</p>
      ) : projects.length === 0 ? (
        <Reveal delay={80}>
          <GlassCard className="mt-4 p-4">
            <p className="text-sm leading-relaxed text-bark-soft">{STRINGS.noProjects[lang]}</p>
            <button
              type="button"
              onClick={() =>
                onDelegateDraft(
                  lang === "fa"
                    ? "تو پروژه‌م این کار رو بکن: "
                    : "In my project, do this: ",
                )
              }
              className="mt-3 rounded-full bg-gradient-to-r from-honey to-honey-light px-4 py-2 text-sm font-bold text-bark transition"
            >
              {STRINGS.delegateTo[lang]}
            </button>
          </GlassCard>
        </Reveal>
      ) : (
        <div className="mt-4 space-y-4">
          {projects.map(({ project, tasks }, index) => (
            <Reveal key={project.id} delay={index * 60}>
              <GlassCard className="p-4" strong>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-serif text-base font-semibold text-bark">{project.name}</h3>
                    <p className="text-xs text-clay">
                      {[project.kind, project.repo, project.branch].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onDelegateDraft(
                        lang === "fa"
                          ? `تو پروژهٔ ${project.name} این کار رو بکن: `
                          : `In ${project.name}, do this: `,
                      )
                    }
                    className="rounded-full bg-gradient-to-r from-honey to-honey-light px-3.5 py-1.5 text-xs font-bold text-bark transition"
                  >
                    {STRINGS.delegateTo[lang]}
                  </button>
                </div>

                {tasks.length === 0 ? (
                  <p className="mt-3 text-sm text-clay">{STRINGS.noTasks[lang]}</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {tasks.map((task) => {
                      const doneSteps = task.plan.filter((step) => step.status === "done").length;
                      const evidenceSteps = task.plan.filter((step) => step.evidence);
                      return (
                        <li
                          key={task.id}
                          className="echomind-glass rounded-2xl p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold leading-snug text-bark">
                              {task.instruction}
                            </p>
                            <span
                              className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(task.status)}`}
                            >
                              {statusLabel(task.status, lang)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-clay">
                            {STRINGS.steps[lang](doneSteps, task.plan.length)}
                          </p>
                          {task.status === "proposed" ? (
                            <div className="mt-2">
                              <p className="text-xs text-honey-deep/90">
                                {STRINGS.needsConfirmation[lang]}
                              </p>
                              <button
                                type="button"
                                disabled={confirmingId === task.id}
                                onClick={() => void handleConfirm(task.id)}
                                className="mt-2 rounded-full bg-gradient-to-r from-amber-300 to-yellow-400 px-4 py-2 text-sm font-bold text-cream transition disabled:opacity-60"
                              >
                                {confirmingId === task.id
                                  ? STRINGS.confirming[lang]
                                  : STRINGS.confirm[lang]}
                              </button>
                            </div>
                          ) : null}
                          {task.result ? (
                            <p className="mt-2 text-sm leading-relaxed text-bark-soft">
                              <span className="font-semibold text-bark">
                                {STRINGS.result[lang]}:{" "}
                              </span>
                              {task.result}
                            </p>
                          ) : null}
                          {evidenceSteps.length > 0 ? (
                            <p className="mt-1 text-xs text-clay">
                              <span className="font-semibold text-bark-soft">
                                {STRINGS.evidence[lang]}:{" "}
                              </span>
                              {evidenceSteps
                                .map((step) => step.evidence)
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </GlassCard>
            </Reveal>
          ))}
        </div>
      )}

      {confirmError ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {confirmError}
        </p>
      ) : null}
    </section>
  );
}
