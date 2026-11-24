"use client";

import { useEffect, useState } from "react";

import { Browser } from "@capacitor/browser";

import type { Locale } from "../lib/direction";
import {
  ApiError,
  getGoogleConnectorStatus,
  confirmAction,
  getGmailCleanupPreview,
  getRecentGmail,
  getUpcomingCalendar,
  proposeAction,
  startGoogleConnection,
  type CalendarEventSummary,
  type GmailMessageSummary,
  type GmailCleanupPreview,
  type GoogleConnectorStatus,
} from "@/services/api";

export default function GoogleConnectionsCard({ locale }: { locale: Locale }) {
  const [status, setStatus] = useState<GoogleConnectorStatus | null>(null);
  const [mail, setMail] = useState<GmailMessageSummary[]>([]);
  const [calendar, setCalendar] = useState<CalendarEventSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [cleanup, setCleanup] = useState<GmailCleanupPreview | null>(null);
  const [cleanupDone, setCleanupDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    try {
      const next = await getGoogleConnectorStatus();
      setStatus(next);
      if (next.connected) {
        const [messages, events] = await Promise.all([
          getRecentGmail(3),
          getUpcomingCalendar(3),
        ]);
        setMail(messages);
        setCalendar(events);
      } else {
        setMail([]);
        setCalendar([]);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setError(err instanceof ApiError ? err.message : "Could not load Google connection.");
    }
  };

  useEffect(() => {
    void refresh();
    const onReady = () => void refresh();
    window.addEventListener("echomind-auth-ready", onReady);
    window.addEventListener("echomind-google-connected", onReady);
    return () => {
      window.removeEventListener("echomind-auth-ready", onReady);
      window.removeEventListener("echomind-google-connected", onReady);
    };
  }, []);

  const previewCleanup = async () => {
    setBusy(true);
    setError(null);
    setCleanupDone(null);
    try {
      setCleanup(await getGmailCleanupPreview(30, 20));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not prepare Gmail cleanup.");
    } finally {
      setBusy(false);
    }
  };

  const trashCleanup = async () => {
    if (!cleanup?.candidates.length) return;
    setBusy(true);
    setError(null);
    try {
      const proposal = await proposeAction({
        tool: "gmail.trash",
        summary:
          locale === "fa"
            ? `${cleanup.candidates.length} ایمیل کم‌اهمیت را به سطل زباله منتقل کن`
            : `Move ${cleanup.candidates.length} low-priority emails to Trash`,
        parameters: { message_ids: cleanup.candidates.map((item) => item.id) },
      });
      const executed = await confirmAction(proposal.id);
      const count =
        typeof executed.result?.trashed === "number"
          ? executed.result.trashed
          : cleanup.candidates.length;
      setCleanupDone(count);
      setCleanup(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not move Gmail messages to Trash.");
    } finally {
      setBusy(false);
    }
  };

  const connect = async (access: "read" | "write") => {
    setBusy(true);
    setError(null);
    try {
      const { authorization_url } = await startGoogleConnection(access);
      await Browser.open({ url: authorization_url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start Google connection.");
    } finally {
      setBusy(false);
    }
  };

  if (!status && !error) return null;

  return (
    <section className="rounded-[1.4rem] border border-metal-line bg-navy p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300/80">
            Google
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-100">Gmail + Calendar</p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            status?.connected
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
              : "border-slate-700 text-slate-400"
          }`}
        >
          {status?.connected
            ? locale === "fa" ? "متصل" : "Connected"
            : locale === "fa" ? "قطع" : "Not connected"}
        </span>
      </div>

      {status && !status.configured ? (
        <p className="mt-3 text-xs leading-5 text-amber-200">
          {locale === "fa"
            ? "تنظیم OAuth گوگل روی سرور لازم است."
            : "Google OAuth setup is required on the server."}
        </p>
      ) : null}

      {status?.configured && !status.connected ? (
        <button
          type="button"
          disabled={busy}
          className="mt-3 min-h-11 rounded-full bg-sky-300 px-4 text-sm font-semibold text-slate-950 disabled:opacity-50"
          onClick={() => void connect("read")}
        >
          {locale === "fa" ? "اتصال Gmail و Calendar" : "Connect Gmail & Calendar"}
        </button>
      ) : null}

      {status?.connected ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-slate-800 p-3">
              <p className="text-lg font-semibold text-slate-100">{mail.length}</p>
              <p className="text-[11px] text-slate-500">{locale === "fa" ? "ایمیل اخیر" : "Recent mail"}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 p-3">
              <p className="text-lg font-semibold text-slate-100">{calendar.length}</p>
              <p className="text-[11px] text-slate-500">{locale === "fa" ? "رویداد آینده" : "Upcoming"}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className="min-h-11 rounded-full border border-sky-500/30 px-4 text-xs font-semibold text-sky-100 disabled:opacity-50"
              onClick={() => void previewCleanup()}
            >
              {locale === "fa" ? "پیدا کردن ایمیل‌های غیرمهم" : "Find low-priority mail"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-11 rounded-full border border-slate-700 px-4 text-xs font-semibold text-slate-300 disabled:opacity-50"
              onClick={() => void connect("write")}
            >
              {locale === "fa" ? "فعال‌کردن اقدام‌های تأییدشده" : "Enable confirmed actions"}
            </button>
          </div>

          {cleanup ? (
            <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-3">
              <p className="text-xs font-semibold text-amber-100">
                {locale === "fa"
                  ? `${cleanup.candidates.length} ایمیل برای پاک‌سازی پیدا شد`
                  : `${cleanup.candidates.length} cleanup candidates`}
              </p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                {locale === "fa"
                  ? "فقط Promotions / Social / Forums قدیمی، بدون Starred و Important. حذف دائمی نمی‌شوند؛ به Trash می‌روند."
                  : "Only older Promotions / Social / Forums, excluding Starred and Important. Nothing is permanently deleted; messages go to Trash."}
              </p>
              <div className="mt-2 max-h-48 space-y-2 overflow-auto">
                {cleanup.candidates.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-800 px-3 py-2">
                    <p className="truncate text-xs font-medium text-slate-200">
                      {item.subject || (locale === "fa" ? "بدون عنوان" : "No subject")}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">{item.sender}</p>
                  </div>
                ))}
              </div>
              {cleanup.candidates.length ? (
                <button
                  type="button"
                  disabled={busy}
                  className="mt-3 min-h-11 rounded-full bg-amber-300 px-4 text-xs font-semibold text-slate-950 disabled:opacity-50"
                  onClick={() => void trashCleanup()}
                >
                  {locale === "fa"
                    ? `تأیید: انتقال ${cleanup.candidates.length} ایمیل به Trash`
                    : `Confirm: move ${cleanup.candidates.length} to Trash`}
                </button>
              ) : null}
            </div>
          ) : null}

          {cleanupDone != null ? (
            <p className="mt-3 text-xs text-emerald-300">
              {locale === "fa"
                ? `${cleanupDone} ایمیل به Trash منتقل شد.`
                : `${cleanupDone} messages moved to Trash.`}
            </p>
          ) : null}
        </>
      ) : null}

      {error ? <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p> : null}
    </section>
  );
}
