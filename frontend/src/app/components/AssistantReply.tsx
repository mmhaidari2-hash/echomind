import type { PillarId } from "@/services/api";

const PILLAR_TONE: Record<PillarId, string> = {
  delay_repay: "border-sky-500/25 bg-sky-400/10 text-sky-200",
  consumer_rights: "border-violet-500/25 bg-violet-400/10 text-violet-200",
  overdraft_shield: "border-emerald-500/25 bg-emerald-400/10 text-emerald-200",
};

type AssistantReplyProps = {
  title: string;
  message: string;
  steps: string[];
  pillar: PillarId;
  pending?: boolean;
  pendingLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function AssistantReply({
  title,
  message,
  steps,
  pillar,
  pending = false,
  pendingLabel = "EchoMind is thinking…",
  actionLabel,
  onAction,
}: AssistantReplyProps) {
  if (pending) {
    return (
      <article className="max-w-[85%] self-start rounded-3xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-300">
        <span className="flex items-center gap-2">
          <span className="echomind-typing" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          {pendingLabel}
        </span>
      </article>
    );
  }

  return (
    <article className="max-w-[90%] self-start rounded-3xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm leading-6 text-slate-200">
      <span
        className={`mb-2 inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${PILLAR_TONE[pillar]}`}
      >
        {title}
      </span>
      <p className="text-slate-200">{message}</p>
      {steps.length > 0 ? (
        <ol className="mt-3 space-y-1.5 ps-4 text-slate-300">
          {steps.map((step, index) => (
            <li key={`${index}-${step.slice(0, 24)}`} className="list-decimal">
              {step}
            </li>
          ))}
        </ol>
      ) : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          className="mt-3 rounded-full border border-sky-500/30 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold text-sky-200"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
    </article>
  );
}
