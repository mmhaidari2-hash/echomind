"use client";

/**
 * EchoMind website — route /site.
 *
 * A product landing page in the SAME frontend as the mobile app (not a
 * new top-level app): it presents what EchoMind is, its six
 * differentiators and how the Outcome Loop works, and links into the
 * real app at `/`. It uses only the shared design system
 * (../components/Glass + globals.css tokens) and Tailwind classes
 * already in the repo. No new dependencies.
 *
 * Bilingual EN/FA: one inline dictionary, a locale toggle in the
 * header, persisted under `echomind.locale`. Persian sets lang/dir on
 * <html> and adds the `font-fa` class, exactly like the app's page.tsx.
 * Layout uses logical Tailwind utilities (ms-/me-/ps-/pe-/text-start)
 * so RTL needs no second layout.
 *
 * Layout fact: the app shell locks body scroll, so this page scrolls
 * inside its own `.echomind-site-scroll` container (100dvh).
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { GlassCard, Orb3D, Reveal, SectionHeading, Waterfall } from "../components/Glass";

type Locale = "en" | "fa";

const LOCALE_KEY = "echomind.locale";

interface DifferentiatorCopy {
  title: string;
  body: string;
}

interface LoopStepCopy {
  title: string;
  body: string;
}

interface OutcomeCopy {
  tag: string;
  title: string;
  body: string;
}

interface SiteCopy {
  brandTag: string;
  openApp: string;
  howItWorks: string;
  heroEyebrow: string;
  heroTitleStart: string;
  heroTitleAccent: string;
  heroTitleEnd: string;
  heroSubtitle: string;
  heroPrimary: string;
  heroSecondary: string;
  heroNote: string;
  diffEyebrow: string;
  diffTitle: string;
  diffSubtitle: string;
  differentiators: DifferentiatorCopy[];
  loopEyebrow: string;
  loopTitle: string;
  loopSubtitle: string;
  loopSteps: LoopStepCopy[];
  loopNote: string;
  outcomesEyebrow: string;
  outcomesTitle: string;
  outcomesSubtitle: string;
  outcomes: OutcomeCopy[];
  footerTitle: string;
  footerBody: string;
  footerStatus: string;
  footerOpenApp: string;
}

const copy: Record<Locale, SiteCopy> = {
  en: {
    brandTag: "UK-first personal AI assistant",
    openApp: "Open the app",
    howItWorks: "How it works",
    heroEyebrow: "EchoMind",
    heroTitleStart: "An assistant that ",
    heroTitleAccent: "finishes things",
    heroTitleEnd: " — not just answers.",
    heroSubtitle:
      "EchoMind keeps your memory, obligations, promises and evidence in one place, spots what is due before you remember it, and follows each job through to a verified outcome.",
    heroPrimary: "Open the app",
    heroSecondary: "See how it works",
    heroNote: "Gmail and Calendar come first. Built for the UK, on Android first.",
    diffEyebrow: "Why EchoMind",
    diffTitle: "Six things that make it different",
    diffSubtitle:
      "Not a chatbot wrapper. Each of these is a working part of the product, built around one user-owned graph.",
    differentiators: [
      {
        title: "Personal Life Graph",
        body: "One user-owned graph across memory, cases, obligations, promises and evidence — so nothing you told EchoMind is ever lost between chats.",
      },
      {
        title: "Obligation Engine",
        body: "Detects deadlines, rights, renewals and refunds before you remember them — a claim window, a renewal date, a reply that is overdue.",
      },
      {
        title: "Promise Tracker",
        body: "Records what a company promised, attaches the evidence, and follows up until the promise is kept or the case is escalated.",
      },
      {
        title: "Outcome Loop",
        body: "Plan, confirm, act, verify, follow up. EchoMind does not stop at an answer — it checks the result and comes back to you.",
      },
      {
        title: "Bounded Authority",
        body: "Every external action has an explicit authority envelope: what it may do, for whom, and with what evidence — and an audit trail to prove it.",
      },
      {
        title: "UK-first outcome engines",
        body: "Consumer rights, Delay Repay, travel and financial friction, grounded in UK rules and UK time — not a generic assistant with a UK skin.",
      },
    ],
    loopEyebrow: "The Outcome Loop",
    loopTitle: "From a message to a finished job",
    loopSubtitle: "Every job EchoMind takes on travels the same five steps. Nothing is marked done until it is checked.",
    loopSteps: [
      { title: "Plan", body: "EchoMind works out what needs to happen and what it needs from you." },
      { title: "Confirm", body: "You approve the plan before anything consequential happens." },
      { title: "Act", body: "EchoMind carries out the agreed steps, inside its authority envelope." },
      { title: "Verify", body: "The result is checked against evidence — a confirmation, a receipt, a reply." },
      { title: "Follow up", body: "If something is still open, EchoMind chases it and tells you the outcome." },
    ],
    loopNote: "If a step cannot be verified, EchoMind says so — it never pretends a job is finished.",
    outcomesEyebrow: "What it does for you",
    outcomesTitle: "Real outcomes, not chat",
    outcomesSubtitle: "A few of the jobs EchoMind is built to carry through to the end.",
    outcomes: [
      {
        tag: "Delay Repay",
        title: "A late train becomes a claim",
        body: "A delayed or cancelled journey is spotted, the 28-day claim window is tracked, and the claim is prepared with the evidence attached.",
      },
      {
        tag: "Consumer rights",
        title: "A faulty purchase becomes a case",
        body: "Your rights are checked against the facts, the right letter is drafted, and the seller's reply is chased until the case closes.",
      },
      {
        tag: "Renewal",
        title: "A renewal becomes a decision",
        body: "Before a subscription or policy renews, EchoMind puts the date, the cost and your options in front of you — in time to act.",
      },
      {
        tag: "Promise chased",
        title: "A promise becomes a follow-up",
        body: "When a company says “we'll get back to you”, that promise is recorded with its evidence and followed up on the day it falls due.",
      },
      {
        tag: "Travel",
        title: "A trip is checked before you go",
        body: "Times, changes and what-ifs are checked against your plans, so a disruption is a re-plan — not a surprise at the station.",
      },
      {
        tag: "Morning brief",
        title: "Your day starts with what matters",
        body: "Deadlines due, promises outstanding and replies waiting — the few things that need you today, and nothing that does not.",
      },
    ],
    footerTitle: "EchoMind is in development",
    footerBody:
      "This page describes what EchoMind is being built to do. Gmail and Calendar come first, then travel and bookings, consumer rights, and finance behind explicit safety gates.",
    footerStatus: "In development — no pricing yet, no accounts to buy, no promises about dates.",
    footerOpenApp: "Open the app",
  },
  fa: {
    brandTag: "دستیار شخصی هوش مصنوعی، اول برای بریتانیا",
    openApp: "باز کردن برنامه",
    howItWorks: "چطور کار می‌کند",
    heroEyebrow: "اکومایند",
    heroTitleStart: "دستیاری که کارها را ",
    heroTitleAccent: "به سرانجام می‌رساند",
    heroTitleEnd: " — نه فقط جواب می‌دهد.",
    heroSubtitle:
      "اکومایند حافظه، تعهدها، قول‌ها و مدارک شما را در یک جا نگه می‌دارد، آنچه را سررسید دارد پیش از آنکه یادتان بیاید پیدا می‌کند و هر کار را تا نتیجهٔ بررسی‌شده دنبال می‌کند.",
    heroPrimary: "باز کردن برنامه",
    heroSecondary: "ببینید چطور کار می‌کند",
    heroNote: "اول جیمیل و تقویم. ساخته‌شده برای بریتانیا، اول روی اندروید.",
    diffEyebrow: "چرا اکومایند",
    diffTitle: "شش چیزی که آن را متفاوت می‌کند",
    diffSubtitle:
      "یک چت‌بات معمولی نیست. هر یک از این‌ها بخشی واقعی از محصول است که حول یک گراف یکپارچهٔ متعلق به شما ساخته شده است.",
    differentiators: [
      {
        title: "گراف زندگی شخصی",
        body: "یک گراف یکپارچه و متعلق به شما برای حافظه، پرونده‌ها، تعهدها، قول‌ها و مدارک — تا هیچ‌چیز از آنچه به اکومایند گفته‌اید میان گفت‌وگوها گم نشود.",
      },
      {
        title: "موتور تعهدها",
        body: "مهلت‌ها، حقوق، تمدیدها و بازپرداخت‌ها را پیش از آنکه یادتان بیاید پیدا می‌کند — مهلت یک ادعا، تاریخ تمدید، پاسخی که دیر شده است.",
      },
      {
        title: "پیگیر قول‌ها",
        body: "قول هر شرکت را با مدرکش ثبت می‌کند و تا وقتی قول عملی شود یا پرونده بالا برود، پیگیری می‌کند.",
      },
      {
        title: "چرخهٔ نتیجه",
        body: "برنامه‌ریزی، تأیید، اقدام، بررسی، پیگیری. اکومایند به یک جواب بسنده نمی‌کند — نتیجه را بررسی می‌کند و به شما برمی‌گردد.",
      },
      {
        title: "اختیار محدود و مشخص",
        body: "هر اقدام بیرونی یک چارچوب اختیار مشخص دارد: چه کاری، برای چه کسی و با چه مدرکی — و یک ردّ قابل بررسی که آن را ثابت می‌کند.",
      },
      {
        title: "موتورهای نتیجه، اول برای بریتانیا",
        body: "حقوق مصرف‌کننده، دیلی ریپی، سفر و اصطکاک مالی، بر پایهٔ قوانین و زمان بریتانیا — نه یک دستیار عمومی با ظاهری بریتانیایی.",
      },
    ],
    loopEyebrow: "چرخهٔ نتیجه",
    loopTitle: "از یک پیام تا یک کار تمام‌شده",
    loopSubtitle: "هر کاری که اکومایند می‌پذیرد از همین پنج مرحله می‌گذرد. هیچ‌چیز تا وقتی بررسی نشده باشد، تمام‌شده حساب نمی‌شود.",
    loopSteps: [
      { title: "برنامه‌ریزی", body: "اکومایند مشخص می‌کند چه کاری باید انجام شود و از شما چه چیزی لازم دارد." },
      { title: "تأیید", body: "پیش از هر اقدام مهم، شما برنامه را تأیید می‌کنید." },
      { title: "اقدام", body: "اکومایند قدم‌های توافق‌شده را در چارچوب اختیارش انجام می‌دهد." },
      { title: "بررسی", body: "نتیجه با مدرک سنجیده می‌شود — یک تأییدیه، یک رسید، یک پاسخ." },
      { title: "پیگیری", body: "اگر چیزی هنوز باز است، اکومایند آن را پیگیری می‌کند و نتیجه را به شما می‌گوید." },
    ],
    loopNote: "اگر مرحله‌ای قابل بررسی نباشد، اکومایند همان را می‌گوید — هرگز وانمود نمی‌کند کاری تمام شده است.",
    outcomesEyebrow: "برای شما چه می‌کند",
    outcomesTitle: "نتیجه‌های واقعی، نه فقط گفت‌وگو",
    outcomesSubtitle: "چند نمونه از کارهایی که اکومایند برای رساندن آن‌ها تا پایان ساخته شده است.",
    outcomes: [
      {
        tag: "دیلی ریپی",
        title: "قطار دیرکرده، به یک ادعا تبدیل می‌شود",
        body: "سفر تأخیری یا لغوشده دیده می‌شود، مهلت ۲۸ روزهٔ ادعا پیگیری می‌شود و ادعا با مدارک پیوست آماده می‌شود.",
      },
      {
        tag: "حقوق مصرف‌کننده",
        title: "خرید معیوب، به یک پرونده تبدیل می‌شود",
        body: "حقوق شما با واقعیت‌ها سنجیده می‌شود، نامهٔ درست نوشته می‌شود و پاسخ فروشنده تا بسته‌شدن پرونده پیگیری می‌شود.",
      },
      {
        tag: "تمدید",
        title: "تمدید، به یک تصمیم تبدیل می‌شود",
        body: "پیش از تمدید اشتراک یا بیمه، اکومایند تاریخ، هزینه و گزینه‌های شما را به‌موقع جلویتان می‌گذارد — وقتی هنوز وقت اقدام هست.",
      },
      {
        tag: "پیگیری قول",
        title: "یک قول، به پیگیری تبدیل می‌شود",
        body: "وقتی شرکتی می‌گوید «به شما برمی‌گردیم»، آن قول با مدرکش ثبت می‌شود و در روزی که سررسید دارد پیگیری می‌شود.",
      },
      {
        tag: "سفر",
        title: "سفر پیش از رفتن بررسی می‌شود",
        body: "زمان‌ها، تغییرها و اگرها با برنامه‌های شما سنجیده می‌شوند، تا اختلال به یک برنامه‌ریزی دوباره تبدیل شود — نه غافلگیری در ایستگاه.",
      },
      {
        tag: "خلاصهٔ صبح",
        title: "روز شما با مهم‌ترین‌ها شروع می‌شود",
        body: "مهلت‌های سررسید، قول‌های باز و پاسخ‌های در انتظار — همان چند چیزی که امروز به شما نیاز دارند، و نه چیزی بیشتر.",
      },
    ],
    footerTitle: "اکومایند در حال توسعه است",
    footerBody:
      "این صفحه توضیح می‌دهد اکومایند برای چه کاری ساخته می‌شود. اول جیمیل و تقویم، بعد سفر و رزرو، حقوق مصرف‌کننده و امور مالی — با دروازه‌های ایمنی مشخص.",
    footerStatus: "در حال توسعه — هنوز قیمتی نیست، حسابی برای خرید نیست و وعده‌ای دربارهٔ تاریخ‌ها داده نمی‌شود.",
    footerOpenApp: "باز کردن برنامه",
  },
};

export default function SitePage() {
  const [locale, setLocale] = useState<Locale>("en");
  const t = copy[locale];

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_KEY);
    if (stored === "fa" || stored === "en") setLocale(stored);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_KEY, locale);
    document.documentElement.lang = locale === "fa" ? "fa" : "en";
    document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
    document.documentElement.classList.toggle("font-fa", locale === "fa");
  }, [locale]);

  const toggleLocale = () => setLocale(locale === "en" ? "fa" : "en");

  return (
    <div className="echomind-site-scroll bg-canvas text-slate-100">
      <div className="echomind-scene relative mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6">
        {/* Ambient depth layers */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-sky-500/10 via-violet-500/10 to-transparent blur-2xl" />

        {/* Header */}
        <header className="sticky top-0 z-20 -mx-4 bg-canvas/80 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2 text-start">
              <span aria-hidden="true" className="echomind-orb-3d inline-block h-8 w-8 shrink-0" />
              <span className="leading-tight">
                <span className="block text-base font-bold text-slate-50">EchoMind</span>
                <span className="block text-[11px] text-slate-400">{t.brandTag}</span>
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleLocale}
                aria-label={locale === "en" ? "Switch to Persian" : "Switch to English"}
                className="echomind-glass rounded-full px-3 py-1.5 text-xs font-semibold text-slate-100"
              >
                {locale === "en" ? "فارسی" : "English"}
              </button>
              <Link
                href="/"
                className="rounded-full bg-sky-400 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-cta"
              >
                {t.openApp}
              </Link>
            </div>
          </div>
        </header>

        {/* (1) Hero */}
        <section className="pt-10 text-center sm:pt-14">
          <Reveal>
            <div className="flex justify-center">
              <Orb3D size={180} className="echomind-depth-2" />
            </div>
          </Reveal>
          <Reveal delay={90}>
            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300/80">
              {t.heroEyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-bold leading-tight text-slate-50 sm:text-4xl">
              {t.heroTitleStart}
              <span className="echomind-gradient-text">{t.heroTitleAccent}</span>
              {t.heroTitleEnd}
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-400 sm:text-base">
              {t.heroSubtitle}
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/"
                className="rounded-full bg-sky-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-cta"
              >
                {t.heroPrimary}
              </Link>
              <a
                href="#how"
                className="echomind-glass rounded-full px-5 py-2.5 text-sm font-semibold text-slate-100"
              >
                {t.heroSecondary}
              </a>
            </div>
            <p className="mt-4 text-xs text-slate-500">{t.heroNote}</p>
          </Reveal>
        </section>

        {/* (2) Six differentiators */}
        <section className="mt-16" aria-label={t.diffTitle}>
          <Reveal>
            <SectionHeading eyebrow={t.diffEyebrow} title={t.diffTitle} subtitle={t.diffSubtitle} />
          </Reveal>
          <Waterfall className="mt-5">
            {t.differentiators.map((item, index) => (
              <Reveal key={item.title} delay={(index % 3) * 90}>
                <GlassCard tilt className="p-4 sm:p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300/80">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-1 text-base font-bold text-slate-50">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{item.body}</p>
                </GlassCard>
              </Reveal>
            ))}
          </Waterfall>
        </section>

        {/* (3) Outcome Loop */}
        <section id="how" className="mt-16 scroll-mt-20" aria-label={t.loopTitle}>
          <Reveal>
            <SectionHeading eyebrow={t.loopEyebrow} title={t.loopTitle} subtitle={t.loopSubtitle} />
          </Reveal>
          <Reveal delay={90}>
            <GlassCard strong className="mt-5 p-4 sm:p-5">
              <ol className="flex flex-col gap-4 sm:flex-row sm:gap-3">
                {t.loopSteps.map((step, index) => (
                  <li key={step.title} className="flex-1 text-start">
                    <p className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-400/20 text-xs font-bold text-sky-300">
                        {index + 1}
                      </span>
                      <span className="text-sm font-bold text-slate-50">{step.title}</span>
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-400 sm:ps-9">{step.body}</p>
                    {index < t.loopSteps.length - 1 ? (
                      <p aria-hidden="true" className="mt-3 text-center text-slate-600 sm:hidden">
                        ↓
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
              <p className="mt-4 border-t border-metal-line pt-3 text-xs leading-relaxed text-slate-400">
                {t.loopNote}
              </p>
            </GlassCard>
          </Reveal>
        </section>

        {/* (4) What it does for you — waterfall feed */}
        <section className="mt-16" aria-label={t.outcomesTitle}>
          <Reveal>
            <SectionHeading
              eyebrow={t.outcomesEyebrow}
              title={t.outcomesTitle}
              subtitle={t.outcomesSubtitle}
            />
          </Reveal>
          <Waterfall className="mt-5">
            {t.outcomes.map((item, index) => (
              <Reveal key={item.title} delay={(index % 3) * 90}>
                <GlassCard tilt className="p-4 sm:p-5">
                  <p className="inline-block rounded-full bg-sky-400/15 px-2.5 py-1 text-[11px] font-semibold text-sky-300">
                    {item.tag}
                  </p>
                  <h3 className="mt-2 text-base font-bold text-slate-50">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{item.body}</p>
                </GlassCard>
              </Reveal>
            ))}
          </Waterfall>
        </section>

        {/* (5) Footer */}
        <footer className="mt-16">
          <Reveal>
            <GlassCard strong className="p-5 text-start sm:p-6">
              <h2 className="text-lg font-bold text-slate-50">{t.footerTitle}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{t.footerBody}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{t.footerStatus}</p>
              <div className="mt-4">
                <Link
                  href="/"
                  className="inline-block rounded-full bg-sky-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-cta"
                >
                  {t.footerOpenApp}
                </Link>
              </div>
            </GlassCard>
          </Reveal>
          <p className="mt-6 text-center text-[11px] text-slate-600">EchoMind — UK-first personal AI assistant</p>
        </footer>
      </div>
    </div>
  );
}
