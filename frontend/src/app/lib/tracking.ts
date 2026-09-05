import type { ApiLocale, WatchPayload } from "@/services/api";

export const WATCHES_KEY = "echomind.watches";
export const BALANCE_KEY = "echomind.balance";

export type StoredBalance = {
  amount: string;
  threshold: string;
};

export function loadWatches(): WatchPayload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WATCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchPayload[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWatches(watches: WatchPayload[]) {
  window.localStorage.setItem(WATCHES_KEY, JSON.stringify(watches.slice(0, 40)));
}

export function loadBalance(): StoredBalance {
  if (typeof window === "undefined") return { amount: "", threshold: "50" };
  try {
    const raw = window.localStorage.getItem(BALANCE_KEY);
    if (!raw) return { amount: "", threshold: "50" };
    const parsed = JSON.parse(raw) as StoredBalance;
    return {
      amount: parsed.amount ?? "",
      threshold: parsed.threshold ?? "50",
    };
  } catch {
    return { amount: "", threshold: "50" };
  }
}

export function saveBalance(balance: StoredBalance) {
  window.localStorage.setItem(BALANCE_KEY, JSON.stringify(balance));
}

export function watchKey(watch: WatchPayload): string {
  return `${watch.kind}:${watch.title}:${watch.anchor_date ?? ""}:${watch.amount ?? ""}`;
}

export function upsertWatch(list: WatchPayload[], next: WatchPayload): WatchPayload[] {
  const key = watchKey(next);
  const without = list.filter((item) => watchKey(item) !== key);
  return [...without, next].slice(-40);
}

export function withLocale(watch: WatchPayload, locale: ApiLocale): WatchPayload {
  return { ...watch, locale };
}
