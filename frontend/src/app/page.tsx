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
  isAuthError,
  isEndpointMissing,
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
import { isPhoneOnline, onPhoneNetworkChange } from "@/services/network";

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

/** Always-answer (round 3): map any chat failure to a visible
    assistant reply in the user's language that names the cause —
    never silence, never a blank space, never a raw "Request failed
    (404)". A 404 means the live server is the older build without
    the stream endpoint; a 401 means sign-in; a timeout means the
    server was too slow. Round 6: only "phone_offline" means the
    device itself has no internet — a plain network_error means the
    phone reports online but the request failed, so the server (not
    the phone) is the cause and it gets the server message, never
    "you're offline". */
function answerForError(error: unknown, locale: Locale): string {
  const t = copy[locale];
  if (error instanceof ApiError) {
    if (isAuthError(error)) return t.answerSignIn;
    if (isEndpointMissing(error)) return t.answerServerOld;
    if (error.status === 503) return t.answerServerBusy;
    if (error.code === "timeout") return t.answerTimeout;
    if (error.code === "phone_offline") return t.answerPhoneOffline;
    if (error.code === "network_error") return t.answerFailed;
    return t.answerFailed;
  }
  if (error instanceof DOMException && error.name === "AbortError") return t.answerTimeout;
  if (error instanceof TypeError)
    return isPhoneOnline() ? t.answerFailed : t.answerPhoneOffline;
  return t.answerFailed;
}

export default function HomePage() {
  const [locale, setLocale] = useState<Locale>("en");
  const [online, setOnline] = useState(false);
  // Round 6: the phone's own internet (Wi-Fi / mobile data), tracked
  // separately from the server health above. The offline banner must
  // show only when the phone itself is offline — the old code showed
  // it whenever the server ping failed, so Mahdi saw "you're offline"
  // while his phone was online and other apps worked.
  const [phoneOffline, setPhoneOffline] = useState(false);
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

  /** Round 5: a wizard renders inside main, below the fold — without
      scrolling, opening one (e.g. tapping the "continue" suggestion
      chip in the fixed footer) looks like nothing happened. Bring the
      wizard into view once React has committed it (two frames). */
  const scrollToSurface = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById("echomind-surface")?.scrollIntoView();
      });
    });
  };

  const openDelayWizard = () => {
    setActiveIntent("travel");
    setSurface("delay");
    scrollToSurface();
  };

  const openRightsWizard = () => {
    setActiveIntent("rights");
    setSurface("rights");
    scrollToSurface();
  };

  const openShieldWizard = () => {
    setActiveIntent("shield");
    setSurface("shield");
    scrollToSurface();
  };

  const openScan = () => {
    setSurface("scan");
    scrollToSurface();
  };

  const openTravel = () => {
    setActiveIntent("travel");
    setSurface("travel");
    scrollToSurface();
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
  /** Last message the scroll effect saw (round 5): the reply replaces
      the pending bubble with the same id, so the effect compares
      against this to notice the replacement. */
  const prevLastRef = useRef<{ id: string; text: string; pending?: boolean } | null>(null);
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
    // Round 6: track the device's connectivity (navigator.onLine +
    // online/offline events), not the server. Initialised from the
    // current value so the banner is correct on first paint.
    setPhoneOffline(!isPhoneOnline());
    return onPhoneNetworkChange((onlineNow) => setPhoneOffline(!onlineNow));
  }, []);

  useEffect(() => {
    // Follow NEW messages only. On mount (empty or restored thread)
    // the page stays at the top: the old version scrolled to the
    // bottom on every mount, so opening the app showed the end of the
    // feed and the hero + hub were pushed above the viewport.
    // Round 5: the reply replaces the pending bubble with the SAME id
    // and the SAME length, so the old length-only effect never fired
    // for it — a reply arriving seconds later sat below the fold and
    // the owner saw "no answer". Scroll when the pending bubble
    // resolves into its answer too — but only for that replacement
    // (same id, was pending): a restored thread carries fresh ids
    // and mount has no previous last message, so neither scrolls.
    const last = messages[messages.length - 1];
    const prevLast = prevLastRef.current;
    prevLastRef.current = last
      ? { id: last.id, text: last.text, pending: last.pending }
      : null;
    const grew = messages.length > prevMessagesLength.current;
    prevMessagesLength.current = messages.length;
    const replyLanded =
      !grew &&
      prevLast !== null &&
      last !== undefined &&
      last.id === prevLast.id &&
      prevLast.pending === true &&
      last.text !== prevLast.text;
    if (!grew && !replyLanded) return;
    const main = mainRef.current;
    if (!main) return;
    // Instant, not smooth, and re-asserted after the frame settles.
    // The previous version scrolled smooth to scrollHeight: on the
    // phone that left the view on blank black space after sending —
    // the smooth programmatic scroll inside this nested scroller
    // leaves the Android WebView showing un-rasterised tiles at the
    // bottom, and its target went stale while the reply arrived (the
    // view stopped 36px short of the bottom in measurement). So
    // re-assert after a frame and after 350ms, when the final height
    // is known — and the effect itself now re-runs when the pending
    // bubble resolves (round 5, above), so a late reply re-scrolls
    // too. Direct scrollTop assignment, no behavior flag: the CSS
    // smooth behaviour is removed too (see globals.css).
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
  }, [messages]);

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
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantId
              ? { id: assistantId, role: "assistant", text: answerForError(error, locale) }
              : item,
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
        setMessages((prev) =>
          prev.map((item) =>
            item.id === pendingId
              ? { id: pendingId, role: "assistant", text: answerForError(error, locale) }
              : item,
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
        // Any stream failure falls back to POST /chat, which the
        // live server answers. The old code only fell back on 503,
        // so a 404 (the older server has no /chat/stream) left the
        // user with a raw error and no answer.
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
      // Always answer: even when both paths fail, the user gets a
      // visible assistant reply naming the cause — never silence,
      // never a blank space after their message.
      setMessages((prev) =>
        prev.map((item) =>
          item.id === pendingId
            ? { id: pendingId, role: "assistant", text: answerForError(error, locale) }
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
        {/* Mockup top bar, two rows on a 360px phone: the wordmark +
            AI ASSISTANT badge and the status pills on row one, the
            Context pill and sign-in on row two. One row cannot fit
            all six controls at 360px without clipping. */}
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-lg font-bold tracking-tight text-ink">
                {t.appName}
              </p>
              <span className="echomind-chip-glass shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-gold">
                AI Assistant
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
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
          <div className="flex w-full items-center justify-between gap-2">
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
            <AuthStatus />
          </div>
        </div>
      </header>

      {phoneOffline ? (
        <div
          role="status"
          aria-live="polite"
          className="shrink-0 border-b border-gold/30 bg-gold/10 px-4 py-2.5 text-center text-sm text-gold"
        >
          {t.offlineBanner}
        </div>
      ) : null}

      <main ref={mainRef} className="echomind-scroll px-4 pb-[calc(env(safe-area-inset-bottom,24px)+88px)] pt-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          {/* First screen (mockup): the wordmark lives in the header
              now, so the hero is the subtitle + the golden orb,
              centred in the viewport with a clear gap below the top
              bar — never pushed down or half-clipped behind the
              composer. A deterministic 100dvh block (viewport −
              header − composer), content centred, so there is no
              dead black void above the orb and no black intermediate
              state while scrolling. */}
          <section
            className="relative flex min-h-[calc(var(--app-height,100dvh)-13rem)] flex-col items-center justify-center gap-4 pt-2"
            aria-label={t.greeting}
          >
            <p className="echomind-fade-up relative mx-auto max-w-xl text-center text-sm leading-6 text-muted">
              {t.subtitle}
            </p>
            <HomeHub lang={locale} thinking={sending} executing={authorityBusy || pendingAction !== null} />
          </section>

          {/* Cards cascade below the orb like the Apple site: the
              suggested next step, then what EchoMind is doing for
              the owner, then the engines. */}
          <CommandBrief locale={locale} onOpenPillar={(pillar) => openParsedPillar(pillar)} />
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

          {/* Zero-height anchor at the top of the wizard surfaces
              (round 5): scrollToSurface() brings an opened wizard
              into view — without it, a wizard opened from the fixed
              footer sits below the fold and the tap looks dead. */}
          {surface !== "home" ? <div id="echomind-surface" aria-hidden className="scroll-mt-3" /> : null}

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
                    className={`relative echomind-glass max-w-[85%] rounded-3xl px-4 py-3 text-base leading-7 ${
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
