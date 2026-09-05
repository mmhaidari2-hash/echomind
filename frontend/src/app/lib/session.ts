import type { PillarId, TravelQuote } from "@/services/api";

export const THREAD_KEY = "echomind.thread";
export const CONVO_KEY = "echomind.conversation_id";
export const INTENT_KEY = "echomind.active_intent";

export type StoredMessage = {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  title?: string;
  steps?: string[];
  pillar?: PillarId;
  travelQuote?: TravelQuote;
};

export function loadThread(): StoredMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(THREAD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredMessage[];
    return Array.isArray(parsed) ? parsed.filter((item) => item.role !== "error" && item.text) : [];
  } catch {
    return [];
  }
}

export function saveThread(messages: StoredMessage[]) {
  const compact = messages
    .filter((item) => item.role !== "error" && item.text && !("pending" in item && item.pending))
    .slice(-40);
  window.localStorage.setItem(THREAD_KEY, JSON.stringify(compact));
}

export function loadConversationId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(CONVO_KEY) || undefined;
}

export function saveConversationId(id?: string) {
  if (!id) {
    window.localStorage.removeItem(CONVO_KEY);
    return;
  }
  window.localStorage.setItem(CONVO_KEY, id);
}
