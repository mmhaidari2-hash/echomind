"use client";

import { dashText } from "../lib/dashboardCopy";
import type { Locale } from "../lib/direction";
import type {
  AlertBundle,
  AlertSeverity,
  DocumentParseResponse,
  PillarId,
  Recommendation,
} from "@/services/api";

type DashboardProps = {
  locale: Locale;
  bundle: AlertBundle | null;
  balance: string;
  threshold: string;
  onBalanceChange: (value: string) => void;
  onThresholdChange: (value: string) => void;
  onOpenPillar: (pillar: PillarId, doc?: DocumentParseResponse) => void;
  onRecommendation: (item: Recommendation) => void;
};

const SEVERITY: Record<AlertSeverity, string> = {
  urgent: "border-red-500/30 bg-red-500/10 text-red-300",
  soon: "border-amber-500/30 bg-gold/10 text-gold",
  watch: "border-gold/40 bg-gold/10 text-gold",
  info: "border-white/[0.09] bg-white/60 text-ink-soft",
};

export default function Dashboard({
  locale,
  bundle,
  balance,
  threshold,
  onBalanceChange,
  onThresholdChange,
  onOpenPillar,
  onRecommendation,
}: DashboardProps) {
  const t = dashText(locale);
  const alerts = bundle?.alerts ?? [];
  const recs = bundle?.recommendations ?? [];

  return (
    <div className="flex flex-col gap-4">
      {alerts.length > 0 ? (
        <section aria-label={t.alertsTitle}>
          <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted">{t.alertsTitle}</p>
          <div className="flex snap-x gap-3 overflow-x-auto pb-1">
            {alerts.map((alert) => (
              <button
                key={alert.id}
                type="button"
                className={`min-w-[78%] snap-start rounded-3xl border p-4 text-start ${SEVERITY[alert.severity]}`}
                onClick={() => {
                  if (alert.action_pillar) onOpenPillar(alert.action_pillar);
                }}
              >
                <p className="text-[11px] uppercase tracking-[0.16em] opacity-80">{alert.title}</p>
                <p className="mt-2 text-sm leading-5">{alert.message}</p>
                {alert.days_remaining != null ? (
                  <p className="mt-2 text-xs opacity-80">
                    {alert.days_remaining} {t.daysLeft}
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <p className="rounded-3xl border border-white/[0.09] bg-white/[0.03] px-4 py-3 text-sm text-muted">
          {t.alertsEmpty}
        </p>
      )}

      {recs[0] ? (
        <section className="rounded-3xl border border-white/[0.09] bg-white/[0.04] p-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted">{t.recsTitle}</p>
          <p className="mt-1 text-sm font-semibold text-ink">{recs[0].title}</p>
          <p className="mt-1 text-xs leading-5 text-muted">{recs[0].reason}</p>
          <button
            type="button"
            className="mt-3 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold"
            onClick={() => onRecommendation(recs[0])}
          >
            {recs[0].action_label}
          </button>
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/[0.09] bg-white/[0.04] p-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300/80">{t.balanceTitle}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-xs text-muted">
            {t.balance}
            <input
              type="number"
              min={0}
              step={0.01}
              className="w-full rounded-2xl border border-white/[0.09] bg-white/[0.06] px-3 py-2.5 text-[16px] text-ink"
              value={balance}
              onChange={(event) => onBalanceChange(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-xs text-muted">
            {t.threshold}
            <input
              type="number"
              min={0}
              step={0.01}
              className="w-full rounded-2xl border border-white/[0.09] bg-white/[0.06] px-3 py-2.5 text-[16px] text-ink"
              value={threshold}
              onChange={(event) => onThresholdChange(event.target.value)}
            />
          </label>
        </div>
      </section>
    </div>
  );
}
