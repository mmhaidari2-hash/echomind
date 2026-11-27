"use client";

import { useEffect, useRef, useState } from "react";

import ActionRail from "./components/ActionRail";
import CommandBrief from "./components/CommandBrief";
import { AuroraBackground, GlassPill } from "./components/Glass";
import DelegatedWork from "./components/DelegatedWork";
import HomeHub from "./components/HomeHub";
import type { ContextWorkflow } from "./components/ActiveContextBar";
import AssistantReply from "./components/AssistantReply";
import AuthStatus from "./components/AuthStatus";
import ChatInput from "./components/ChatInput";
import ContextDrawer from "./components/ContextDrawer";
import ContextualSuggestions, {
  buildSuggestions,
} from "./components/ContextualSuggestions";
import DelayRepayWizard from "./components/DelayRepayWizard";
import ConsumerRightsWizard from "./components/ConsumerRightsWizard";
import DocumentUpload from "./components/DocumentUpload";
import OverdraftShieldWizard from "./components/OverdraftShieldWizard";
import TravelApprovalCard from "./components/TravelApprovalCard";
import { copy, type IntentId } from "./lib/copy";
import { travelText } from "./lib/travelCopy";
import { isBookableTravelIntent, parseTravelIntent } from "./lib/travelIntent";
import {
  detectTextDirection,
  localeDir,
  type Locale,
} from "./lib/direction";
import { useAppViewport } from "./hooks/useAppViewport";
import { useAssistantMemory } from "./hooks/useAssistantMemory";
import {
  loadConversationId,
  loadThread,
  saveConversationId,
  saveThread,
} from "./lib/session";
import {
  loadBalance,
  loadWatches,
  saveBalance,
  saveWatches,
  upsertWatch,
  withLocale,
} from "./lib/tracking";
import {
  ApiError,
  evaluateAlerts,
  getHealth,
  getConversation,
  getGmailCleanupPreview,
  getMemoryProfile,
  getLifeSnapshot,
  parseDocumentFile,
  proposeAction,
  confirmAction,
  cancelAction,
  saveContextTags,
  savePreferences,
  sendChat,
  streamChat,
  quoteTravelIntent,
  confirmTravelIntent,
  type ActionProposal,
  type AlertBundle,
  type TravelQuote,
  type ConsumerRightsPrefill,
  type DelayRepayPrefill,
  type DocumentParseResponse,
  type OverdraftPrefill,
  type PillarId,
  type UserPreferences,
  type LifeSnapshot,
  type WatchPayload,
} from "@/services/api";

type ThreadMessage = {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  title?: string;
  steps?: string[];
  pillar?: PillarId;
  pending?: boolean;
  travelQuote?: TravelQuote;
};

type Surface = "home" | "delay" | "rights" | "shield" | "scan" | "travel";

const LOCALE_KEY = "echomind.locale";

function isGmailCleanupCommand(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const mentionsMail = /\b(gmail|email|emails|mail)\b/i.test(normalized) || /ایمیل/.test(normalized);
  const asksCleanup =
    /\b(delete|remove|trash|clean|cleanup|clear)\b/i.test(normalized) ||
    /(پاک|حذف|تمیز|خالی)/.test(normalized);
  return mentionsMail && asksCleanup;
}

function workflowFromSurface(surface: Surface): ContextWorkflow {
  if (surface === "delay") return "delay_repay";
  if (surface === "rights") return "consumer_rights";
  if (surface === "shield") return "overdraft_shield";
  if (surface === "scan") return "scan";
  if (surface === "travel") return "travel";
  return "idle";
}

async function pingHealth(): Promise<boolean> {
  try {
    const body = await getHealth();
    return body.status === "healthy";
  } catch {
    return false;
  }
}

export default function HomePage() {
  const [locale, setLocale] = useState<Locale>("en");
  const [online, setOnline] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [activeIntent, setActiveIntent] = useState<IntentId | undefined>();
  const [surface, setSurface] = useState<Surface>("home");
  const [delayPrefill, setDelayPrefill] = useState<DelayRepayPrefill | null>(null);
  const [rightsPrefill, setRightsPrefill] = useState<ConsumerRightsPrefill | null>(null);
  const [shieldPrefill, setShieldPrefill] = useState<OverdraftPrefill | null>(null);
  const [activeDocument, setActiveDocument] = useState<DocumentParseResponse | null>(null);
  const [pendingAction, setPendingAction] = useState<ActionProposal | null>(null);
  const [pendingWatch, setPendingWatch] = useState<WatchPayload | null>(null);
  const [authorityBusy, setAuthorityBusy] = useState(false);
  const [authorityError, setAuthorityError] = useState<string | null>(null);
  const [watches, setWatches] = useState<WatchPayload[]>([]);
  const [balance, setBalance] = useState("");
  const [threshold, setThreshold] = useState("50");
  const [bundle, setBundle] = useState<AlertBundle | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences>({ locale: "en", tone: "concise" });
  const [lifeSnapshot, setLifeSnapshot] = useState<LifeSnapshot | null>(null);
  const [tagText, setTagText] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const memory = useAssistantMemory();
  useAppViewport();

  const openDelayWizard = () => {
    setActiveIntent("travel");
    setSurface("delay");
  };

  const openRightsWizard = () => {
    setActiveIntent("rights");
    setSurface("rights");
  };

  const openShieldWizard = () => {
    setActiveIntent("shield");
    setSurface("shield");
  };

  const openScan = () => {
    setSurface("scan");
  };

  const openTravel = () => {
    setActiveIntent("travel");
    setSurface("travel");
  };

  const clearContext = () => {
    setSurface("home");
    setActiveIntent(undefined);
    setActiveDocument(null);
    setDelayPrefill(null);
    setRightsPrefill(null);
    setShieldPrefill(null);
  };

  const mainRef = useRef<HTMLElement>(null);
  /** Length of the thread the last time the scroll effect ran. The
      home feed must NOT scroll on mount — neither for an empty thread
      nor for a restored one: the owner opens the app to the hero +
      hub, not to the end of the feed. Only a newly added message
      (the owner sending, or the assistant answering) scrolls. */
  const prevMessagesLength = useRef(0);
  const persistReady = useRef(false);
  const t = copy[locale];
  const shellDir = localeDir(locale);

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_KEY);
    if (stored === "fa" || stored === "en") setLocale(stored);
    setWatches(loadWatches());
    const storedBalance = loadBalance();
    setBalance(storedBalance.amount);
    setThreshold(storedBalance.threshold);
    const storedThread = loadThread();
    if (storedThread.length) {
      setMessages(storedThread);
      // A restored thread is not a new message — do not scroll for it.
      prevMessagesLength.current = storedThread.length;
    }
    const storedConvo = loadConversationId();
    if (storedConvo) setConversationId(storedConvo);

    let cancelled = false;
    const loadProtectedState = async () => {
      try {
        const [profile, life] = await Promise.all([getMemoryProfile(), getLifeSnapshot()]);
        if (cancelled) return;
        setPreferences(profile.preferences);
        setLifeSnapshot(life);
        setTagText(profile.tags.filter((tag) => tag.active).map((tag) => tag.label).join(", "));
        if (storedConvo) {
          const remote = await getConversation(storedConvo);
          if (!cancelled) {
            setMessages(
              remote.turns.map((turn) => ({
                id: crypto.randomUUID(),
                role: turn.role,
                text: turn.text,
                pillar: turn.pillar ?? undefined,
              })),
            );
            // Remote restore is not a new message either.
            prevMessagesLength.current = remote.turns.length;
          }
        }
      } catch {
        // Local cache remains visible until a secure session is available.
      }
    };

    void loadProtectedState();
    window.addEventListener("echomind-auth-ready", loadProtectedState);
    return () => {
      cancelled = true;
      window.removeEventListener("echomind-auth-ready", loadProtectedState);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_KEY, locale);
    document.documentElement.lang = locale === "fa" ? "fa" : "en";
    document.documentElement.dir = shellDir;
    document.documentElement.classList.toggle("font-fa", locale === "fa");
  }, [locale, shellDir]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const ok = await pingHealth();
      if (!cancelled) setOnline(ok);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    // Follow NEW messages only. On mount (empty or restored thread)
    // the page stays at the top: the old version scrolled to the
    // bottom on every mount, so opening the app showed the end of the
    // feed and the hero + hub were pushed above the viewport.
    if (messages.length <= prevMessagesLength.current) {
      prevMessagesLength.current = messages.length;
      return;
    }
    prevMessagesLength.current = messages.length;
    const main = mainRef.current;
    if (!main) return;
    // Instant, not smooth, and re-asserted after the frame settles.
    // The previous version scrolled smooth to scrollHeight: on the
    // phone that left the view on blank black space after sending —
    // the smooth programmatic scroll inside this nested scroller
    // leaves the Android WebView showing un-rasterised tiles at the
    // bottom, and its target went stale while the reply arrived (the
    // view stopped 36px short of the bottom in measurement). The
    // reply replaces the pending bubble without changing the length,
    // so re-assert after a frame and after 350ms, when the final
    // height is known. Direct scrollTop assignment, no behavior flag:
    // the CSS smooth behaviour is removed too (see globals.css).
    const scrollToBottom = () => {
      main.scrollTop = main.scrollHeight;
    };
    scrollToBottom();
    let timer = 0;
    const raf = window.requestAnimationFrame(() => {
      scrollToBottom();
      timer = window.setTimeout(scrollToBottom, 350);
    });
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [messages.length]);

  useEffect(() => {
    if (!persistReady.current) {
      persistReady.current = true;
      return;
    }
    saveThread(messages);
    saveConversationId(conversationId);
  }, [messages, conversationId]);

  useEffect(() => {
    saveWatches(watches);
    saveBalance({ amount: balance, threshold });
    let cancelled = false;
    const payload = {
      watches: watches.map((item) => withLocale(item, locale)),
      locale,
      ...(balance && threshold
        ? { balance: Number(balance), balance_threshold: Number(threshold) }
        : {}),
    };
    void evaluateAlerts(payload)
      .then((next) => {
        if (!cancelled) setBundle(next);
      })
      .catch(() => {
        if (!cancelled) setBundle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [watches, balance, threshold, locale]);

  const trackWatch = async (watch: WatchPayload) => {
    const next = withLocale(watch, locale);
    setAuthorityBusy(true);
    setAuthorityError(null);
    try {
      const proposal = await proposeAction({
        tool: "watch.create",
        summary:
          locale === "fa"
            ? `پیگیری «${next.title}» را فعال کن`
            : `Track “${next.title}” and its deadline`,
        parameters: next as unknown as Record<string, unknown>,
      });
      setPendingWatch(next);
      setPendingAction(proposal);
    } catch (error) {
      setAuthorityError(error instanceof ApiError ? error.message : "Could not prepare the action.");
    } finally {
      setAuthorityBusy(false);
    }
  };

  const trackDocument = (doc: DocumentParseResponse) => {
    setActiveDocument(doc);
    if (doc.delay_repay?.journey_date) {
      trackWatch({
        kind: "delay_repay",
        title: doc.summary,
        anchor_date: doc.delay_repay.journey_date,
        amount: doc.delay_repay.ticket_cost != null ? Number(doc.delay_repay.ticket_cost) : undefined,
        locale,
      });
    }
    if (doc.consumer_rights?.purchase_date) {
      trackWatch({
        kind: "purchase",
        title: doc.consumer_rights.retailer_name || doc.summary,
        anchor_date: doc.consumer_rights.purchase_date,
        amount:
          doc.consumer_rights.purchase_price != null
            ? Number(doc.consumer_rights.purchase_price)
            : undefined,
        locale,
      });
    }
    memory.rememberDocument(doc);
    if (doc.overdraft_shield?.fee_date) {
      trackWatch({
        kind: "overdraft",
        title: doc.overdraft_shield.bank_name || doc.summary,
        anchor_date: doc.overdraft_shield.fee_date,
        amount:
          doc.overdraft_shield.fee_amount != null
            ? Number(doc.overdraft_shield.fee_amount)
            : undefined,
        locale,
      });
    }
  };

  const openParsedPillar = (pillar: PillarId, doc?: DocumentParseResponse) => {
    if (doc) setActiveDocument(doc);
    if (pillar === "delay_repay") {
      setDelayPrefill(doc?.delay_repay ?? null);
      openDelayWizard();
      return;
    }
    if (pillar === "consumer_rights") {
      setRightsPrefill(doc?.consumer_rights ?? null);
      openRightsWizard();
      return;
    }
    setShieldPrefill(doc?.overdraft_shield ?? null);
    openShieldWizard();
  };

  const handleSend = async ({
    text,
    attachments,
  }: {
    text: string;
    attachments: File[];
  }) => {
    const names = attachments.map((file) => file.name);
    const body = [text, names.length ? `[${names.join(", ")}]` : ""]
      .filter(Boolean)
      .join(" ");
    if (attachments[0]) {
      try {
        const parsed = await parseDocumentFile(attachments[0], {
          hint: text.trim() || undefined,
          locale,
        });
        trackDocument(parsed);
        if (parsed.suggested_pillar) {
          openParsedPillar(parsed.suggested_pillar, parsed);
          if (!text.trim()) return;
        }
      } catch {
        // Fall through to chat if the parser cannot read the file.
      }
    }
    if (!body || sending) return;

    if (isGmailCleanupCommand(text)) {
      const userId = crypto.randomUUID();
      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: userId, role: "user", text: body },
        { id: assistantId, role: "assistant", text: "", pending: true },
      ]);
      setSending(true);
      setAuthorityError(null);
      try {
        const cleanup = await getGmailCleanupPreview(30, 20);
        if (!cleanup.candidates.length) {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantId
                ? {
                    id: assistantId,
                    role: "assistant",
                    text:
                      locale === "fa"
                        ? "ایمیل کم‌اهمیت امنی برای پاک‌سازی پیدا نکردم. هیچ چیزی حذف نشد."
                        : "I did not find any low-priority mail that matched the safe cleanup rules. Nothing was removed.",
                  }
                : item,
            ),
          );
          return;
        }

        const proposal = await proposeAction({
          tool: "gmail.trash",
          summary:
            locale === "fa"
              ? `${cleanup.candidates.length} ایمیل کم‌اهمیت را به Trash منتقل کن`
              : `Move ${cleanup.candidates.length} low-priority emails to Trash`,
          parameters: { message_ids: cleanup.candidates.map((item) => item.id) },
        });
        setPendingAction(proposal);
        const previewLines = cleanup.candidates
          .slice(0, 5)
          .map((item) => `• ${item.subject || item.sender || (locale === "fa" ? "بدون عنوان" : "No subject")}`)
          .join("\n");
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantId
              ? {
                  id: assistantId,
                  role: "assistant",
                  text:
                    locale === "fa"
                      ? `برای بررسی ${cleanup.candidates.length} ایمیل پیدا کردم. فقط Promotions / Social / Forums قدیمی‌اند و Starred یا Important نیستند.\n\n${previewLines}\n\nبرای انتقال به Trash، اقدام را تأیید کن.`
                      : `I found ${cleanup.candidates.length} messages for review. They are older Promotions / Social / Forums and exclude Starred or Important mail.\n\n${previewLines}\n\nConfirm the action to move them to Trash.`,
                }
              : item,
          ),
        );
      } catch (error) {
        const detail = error instanceof ApiError ? error.message : t.sendFailed;
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantId ? { id: assistantId, role: "error", text: detail } : item,
          ),
        );
      } finally {
        setSending(false);
      }
      return;
    }

    const travelIntent = parseTravelIntent(text, locale);
    if (isBookableTravelIntent(travelIntent)) {
      const userId = crypto.randomUUID();
      const pendingId = crypto.randomUUID();
      setActiveIntent("travel");
      setSurface("travel");
      setMessages((prev) => [
        ...prev,
        { id: userId, role: "user", text: body },
        { id: pendingId, role: "assistant", text: "", pending: true },
      ]);
      setSending(true);
      try {
        const quote = await quoteTravelIntent({ query: text, locale });
        setMessages((prev) =>
          prev.map((item) =>
            item.id === pendingId
              ? {
                  id: pendingId,
                  role: "assistant",
                  text: quote.summary,
                  title: travelText(locale).title,
                  travelQuote: quote,
                }
              : item,
          ),
        );
      } catch (error) {
        const detail = error instanceof ApiError ? error.message : t.sendFailed;
        setMessages((prev) =>
          prev.map((item) =>
            item.id === pendingId ? { id: pendingId, role: "error", text: detail } : item,
          ),
        );
      } finally {
        setSending(false);
      }
      return;
    }

    const userId = crypto.randomUUID();
    const pendingId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text: body },
      { id: pendingId, role: "assistant", text: "", pending: true },
    ]);
    setSending(true);

    const chatPayload = {
      message: body,
      conversation_id: conversationId,
      locale,
      metadata: {
        intent: activeIntent,
        source: "pwa",
        attachment_names: names,
        memory_hints: memory.recall(body),
      },
    };

    try {
      try {
        let streamedText = "";
        const streamed = await streamChat(chatPayload, (delta) => {
          streamedText += delta;
          setMessages((prev) =>
            prev.map((item) =>
              item.id === pendingId
                ? { ...item, pending: false, text: streamedText }
                : item,
            ),
          );
        });
        setConversationId(streamed.conversation_id);
        setMessages((prev) =>
          prev.map((item) =>
            item.id === pendingId
              ? {
                  id: pendingId,
                  role: "assistant",
                  text: streamed.message,
                  pillar: streamed.pillar,
                }
              : item,
          ),
        );
      } catch (streamError) {
        if (!(streamError instanceof ApiError) || streamError.status !== 503) {
          throw streamError;
        }
        const reply = await sendChat(chatPayload);
        setConversationId(reply.conversation_id);
        setMessages((prev) =>
          prev.map((item) =>
            item.id === pendingId
              ? {
                  id: pendingId,
                  role: "assistant",
                  text: reply.message,
                  title: reply.title,
                  steps: reply.steps,
                  pillar: reply.pillar,
                }
              : item,
          ),
        );
      }
    } catch (error) {
      const detail =
        error instanceof ApiError ? error.message : t.sendFailed;
      setMessages((prev) =>
        prev.map((item) =>
          item.id === pendingId
            ? { id: pendingId, role: "error", text: detail }
            : item,
        ),
      );
    } finally {
      setSending(false);
    }
  };

  const workflow = workflowFromSurface(surface);

  // Delegation from the home screen: prefill the composer with a
  // "go do this in my project" sentence and focus it, so the owner can
  // finish the instruction in Persian or English and send it.
  const handleDelegateDraft = (text: string) => {
    setDraft(text);
    window.setTimeout(() => {
      document.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    }, 50);
  };
  const memoryLabel = [preferences.home_station, tagText]
    .filter(Boolean)
    .join(" · ") || null;
  const documentLabel = activeDocument?.summary || activeDocument?.filename || null;

  return (
    <div
      dir={shellDir}
      lang={locale === "fa" ? "fa" : "en"}
      className={`echomind-app bg-obsidian ${locale === "fa" ? "font-fa" : "font-sans"}`}
    >
      <AuroraBackground />
      <header className="echomind-glass-header z-20 shrink-0 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2">
          <GlassPill
            className="relative"
            aria-label={t.contextOpen}
            aria-expanded={contextOpen}
            onClick={() => setContextOpen(true)}
          >
            {t.contextTab}
            {workflow !== "idle" || documentLabel || memoryLabel ? (
              <span className="ms-1.5 inline-block h-1.5 w-1.5 rounded-full bg-gold-light" />
            ) : null}
          </GlassPill>
          <div className="flex min-w-0 items-center gap-2">
            <AuthStatus />
            <span
              role="status"
              aria-live="polite"
              aria-label={online ? t.online : t.local}
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                online ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" : "bg-gold"
              }`}
            />
            <GlassPill
              className="gap-1"
              aria-label={t.langToggle}
              onClick={() => setLocale((prev) => (prev === "en" ? "fa" : "en"))}
            >
              <span className={locale === "en" ? "text-gold" : "text-muted"}>
                EN
              </span>
              <span className="text-muted">/</span>
              <span className={locale === "fa" ? "text-gold" : "text-muted"}>
                فا
              </span>
            </GlassPill>
          </div>
        </div>
      </header>

      {!online ? (
        <div
          role="status"
          aria-live="polite"
          className="shrink-0 border-b border-gold/30 bg-gold/10 px-4 py-2.5 text-center text-sm text-gold"
        >
          {t.offlineBanner}
        </div>
      ) : null}

      <main ref={mainRef} className="echomind-scroll px-4 pb-10 pt-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          <section className="relative space-y-1 text-center" aria-label={t.greeting}>
            <h1 className="echomind-hero-title echomind-fade-up relative text-4xl font-bold tracking-tight sm:text-5xl">
              {t.appName}
            </h1>
            <p className="echomind-fade-up relative mx-auto max-w-xl text-sm leading-6 text-muted">
              {t.subtitle}
            </p>
          </section>

          {/* The home screen IS the hub: EchoMind at the centre, the
              owner's apps orbiting it, and below it what EchoMind is
              doing for him — the delegated work. The engines stay
              visible further down (ActionRail waterfall). */}
          <CommandBrief locale={locale} onOpenPillar={(pillar) => openParsedPillar(pillar)} />
          <HomeHub lang={locale} thinking={sending} executing={authorityBusy || pendingAction !== null} />
          <DelegatedWork lang={locale} onDelegateDraft={handleDelegateDraft} />

          <ActionRail
            locale={locale}
            active={workflow}
            onDelay={() => {
              setDelayPrefill({
                origin: preferences.home_station,
                destination: preferences.work_station,
                operator: preferences.preferred_operator,
              });
              openDelayWizard();
            }}
            onShield={() => {
              setShieldPrefill(null);
              openShieldWizard();
            }}
            onScan={openScan}
            onTravel={openTravel}
            onRights={() => {
              setRightsPrefill(null);
              openRightsWizard();
            }}
          />

          {surface === "delay" ? (
            <DelayRepayWizard
              locale={locale}
              prefill={delayPrefill}
              onClose={() => setSurface("home")}
              onTracked={trackWatch}
            />
          ) : null}
          {surface === "rights" ? (
            <ConsumerRightsWizard
              locale={locale}
              prefill={rightsPrefill}
              onClose={() => setSurface("home")}
              onTracked={trackWatch}
            />
          ) : null}
          {surface === "shield" ? (
            <OverdraftShieldWizard
              locale={locale}
              prefill={shieldPrefill}
              onClose={() => setSurface("home")}
              onTracked={trackWatch}
            />
          ) : null}
          {surface === "scan" ? (
            <DocumentUpload
              locale={locale}
              onParsed={trackDocument}
              onOpenPillar={openParsedPillar}
            />
          ) : null}
          {surface === "travel" ? (
            <section className="echomind-glass rounded-[1.6rem] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold/80">
                {travelText(locale).title}
              </p>
              <p className="mt-1 text-sm text-muted">{travelText(locale).hint}</p>
            </section>
          ) : null}

          {pendingAction ? (
            <section className="rounded-[1.4rem] border border-gold/40 bg-gold/10 p-4" aria-live="polite">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
                {locale === "fa" ? "تأیید اقدام" : "Confirm action"}
              </p>
              <p className="mt-1 text-sm text-ink">{pendingAction.summary}</p>
              <p className="mt-1 text-xs text-muted">
                {locale === "fa"
                  ? "تا وقتی تأیید نکنی، EchoMind این اقدام را اجرا نمی‌کند."
                  : "EchoMind will not execute this action until you confirm it."}
              </p>
              {authorityError ? <p className="mt-2 text-xs text-red-300">{authorityError}</p> : null}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={authorityBusy}
                  className="min-h-11 rounded-full bg-gold px-4 text-sm font-semibold text-obsidian disabled:opacity-50"
                  onClick={async () => {
                    setAuthorityBusy(true);
                    setAuthorityError(null);
                    try {
                      const executed = await confirmAction(pendingAction.id);
                      if (executed.status !== "executed") {
                        throw new ApiError("The action was not executed.", { code: "authority_not_executed" });
                      }
                      if (pendingWatch) {
                        setWatches((prev) => upsertWatch(prev, pendingWatch));
                        memory.rememberWatch(pendingWatch);
                      }
                      setPendingAction(null);
                      setPendingWatch(null);
                    } catch (error) {
                      setAuthorityError(error instanceof ApiError ? error.message : "Action failed.");
                    } finally {
                      setAuthorityBusy(false);
                    }
                  }}
                >
                  {locale === "fa" ? "تأیید و اجرا" : "Confirm & run"}
                </button>
                <button
                  type="button"
                  disabled={authorityBusy}
                  className="min-h-11 rounded-full border border-white/[0.09] px-4 text-sm font-semibold text-ink-soft disabled:opacity-50"
                  onClick={async () => {
                    setAuthorityBusy(true);
                    try {
                      await cancelAction(pendingAction.id);
                    } catch {
                      // Cancellation is fail-closed; the unconfirmed action cannot execute.
                    } finally {
                      setPendingAction(null);
                      setPendingWatch(null);
                      setAuthorityBusy(false);
                    }
                  }}
                >
                  {locale === "fa" ? "لغو" : "Cancel"}
                </button>
              </div>
            </section>
          ) : authorityError ? (
            <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {authorityError}
            </p>
          ) : null}

          {messages.length > 0 ? (
            <section className="flex flex-col gap-3" aria-live="polite">
              {messages.map((message) => {
                if (message.travelQuote) {
                  return (
                    <TravelApprovalCard
                      key={message.id}
                      locale={locale}
                      quote={message.travelQuote}
                      confirmed={message.travelQuote.status === "confirmed"}
                      onConfirm={async () => {
                        const next = await confirmTravelIntent({
                          intent_id: message.travelQuote!.intent_id,
                          confirm_token: message.travelQuote!.confirm_token,
                          locale,
                        });
                        setMessages((prev) =>
                          prev.map((item) =>
                            item.id === message.id
                              ? { ...item, travelQuote: next, text: next.summary }
                              : item,
                          ),
                        );
                      }}
                    />
                  );
                }
                if (message.role === "assistant") {
                  return (
                    <AssistantReply
                      key={message.id}
                      title={message.title ?? "EchoMind"}
                      message={message.text}
                      steps={message.steps ?? []}
                      pillar={message.pillar ?? "consumer_rights"}
                      locale={locale}
                      pending={message.pending}
                      pendingLabel={t.thinking}
                      actionLabel={
                        !message.pending && message.pillar === "delay_repay"
                          ? t.delayWizard
                          : !message.pending && message.pillar === "consumer_rights"
                            ? t.rightsWizard
                            : !message.pending && message.pillar === "overdraft_shield"
                              ? t.shieldWizard
                              : undefined
                      }
                      onAction={
                        !message.pending && message.pillar === "delay_repay"
                          ? openDelayWizard
                          : !message.pending && message.pillar === "consumer_rights"
                            ? openRightsWizard
                            : !message.pending && message.pillar === "overdraft_shield"
                              ? openShieldWizard
                              : undefined
                      }
                    />
                  );
                }
                const dir = detectTextDirection(message.text, shellDir);
                const isUser = message.role === "user";
                return (
                  <article
                    key={message.id}
                    dir={dir}
                    className={`echomind-glass max-w-[85%] rounded-3xl px-4 py-3 text-base leading-7 ${
                      isUser ? "self-end text-ink" : "self-start text-red-300"
                    }`}
                  >
                    {message.text}
                  </article>
                );
              })}
            </section>
          ) : null}
        </div>
      </main>

      <ChatInput
        locale={locale}
        value={draft}
        onChange={setDraft}
        onSend={(payload) => {
          void handleSend(payload);
        }}
        disabled={sending}
        leading={
          <ContextualSuggestions
            locale={locale}
            suggestions={buildSuggestions(
              locale,
              preferences,
              tagText.split(",").map((item) => item.trim()).filter(Boolean),
              [...messages].reverse().find((item) => item.pillar)?.pillar,
            )}
            onPick={(item) => {
              if (item.draft) setDraft(item.draft);
              if (item.pillar === "delay_repay") {
                setDelayPrefill({
                  origin: preferences.home_station,
                  destination: preferences.work_station,
                  operator: preferences.preferred_operator,
                });
                openDelayWizard();
                return;
              }
              if (item.pillar === "consumer_rights") {
                openRightsWizard();
                return;
              }
              if (item.pillar === "overdraft_shield") {
                openShieldWizard();
              }
            }}
          />
        }
      />
      <ContextDrawer
        open={contextOpen}
        onClose={() => setContextOpen(false)}
        locale={locale}
        workflow={workflow}
        documentLabel={documentLabel}
        memoryLabel={memoryLabel}
        onClear={clearContext}
        bundle={bundle}
        balance={balance}
        threshold={threshold}
        onBalanceChange={setBalance}
        onThresholdChange={setThreshold}
        onOpenPillar={openParsedPillar}
        onRecommendation={(item) => openParsedPillar(item.action_pillar)}
        preferences={preferences}
        tagText={tagText}
        lifeSnapshot={lifeSnapshot}
        onLifeChanged={async () => {
          const next = await getLifeSnapshot();
          setLifeSnapshot(next);
        }}
        onSavePreferences={async (prefs, tags) => {
          const labels = tags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
            .map((label) => ({ label, active: true }));
          await Promise.all([savePreferences(prefs), saveContextTags(labels)]);
          setPreferences(prefs);
          setTagText(tags);
        }}
      />
    </div>
  );
}
