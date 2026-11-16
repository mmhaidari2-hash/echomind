"use client";

import type { LifeSnapshot } from "@/services/api";
import type { Locale } from "../lib/direction";

export default function LifeSummaryCard({
  locale,
  snapshot,
}: {
  locale: Locale;
  snapshot: LifeSnapshot | null;
}) {
  if (!snapshot) return null;

  const overdue = snapshot.obligations.filter((item) => item.status === "overdue").length;
  const dueSoon = snapshot.obligations.filter((item) => item.status === "due_soon").length;
  const openPromises = snapshot.promises.filter((item) => item.status === "open").length;

  return (
    <section className="rounded-[1.4rem] border border-metal-line bg-navy p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300/80">
        {locale === "fa" ? "زندگی من" : "My life"}
      </p>
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
      {snapshot.obligations.length || snapshot.promises.length ? (
        <div className="mt-3 space-y-2">
          {snapshot.obligations.slice(0, 3).map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-800 px-3 py-2">
              <p className="text-xs font-medium text-slate-200">{item.title}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {item.status.replace("_", " ")}
                {item.due_date ? ` · ${item.due_date}` : ""}
              </p>
            </div>
          ))}
          {snapshot.promises.slice(0, 2).map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-800 px-3 py-2">
              <p className="text-xs font-medium text-slate-200">{item.counterparty}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{item.promise}</p>
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
