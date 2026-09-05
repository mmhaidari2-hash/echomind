"use client";

import { useCallback, useEffect, useState } from "react";

import {
  saveMemoryFact,
  type DocumentParseResponse,
  type MemoryFact,
  type MemoryFactCreate,
  type WatchPayload,
} from "@/services/api";

const MEMORY_KEY = "echomind.memory";

function loadFacts(): MemoryFact[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MEMORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MemoryFact[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistFacts(facts: MemoryFact[]) {
  window.localStorage.setItem(MEMORY_KEY, JSON.stringify(facts.slice(0, 80)));
}

function localFact(payload: MemoryFactCreate): MemoryFact {
  return {
    id: crypto.randomUUID().replace(/-/g, "").slice(0, 12),
    key: payload.key,
    value: payload.value,
    source: payload.source ?? "chat",
    created_at: new Date().toISOString(),
  };
}

export function useAssistantMemory() {
  const [facts, setFacts] = useState<MemoryFact[]>([]);

  useEffect(() => {
    setFacts(loadFacts());
  }, []);

  const remember = useCallback((payload: MemoryFactCreate) => {
    const next = localFact(payload);
    setFacts((prev) => {
      const exists = prev.some((item) => item.key === next.key && item.value === next.value);
      const merged = exists ? prev : [next, ...prev].slice(0, 80);
      persistFacts(merged);
      return merged;
    });
    void saveMemoryFact(payload).catch(() => undefined);
    return next;
  }, []);

  const rememberDocument = useCallback(
    (doc: DocumentParseResponse) => {
      if (doc.entities.operator_name) {
        remember({ key: "operator", value: doc.entities.operator_name, source: "document" });
      }
      if (doc.entities.vendors[0]) {
        remember({ key: "vendor", value: doc.entities.vendors[0], source: "document" });
      }
      if (doc.entities.amounts[0] != null) {
        remember({ key: "amount", value: `£${doc.entities.amounts[0]}`, source: "document" });
      }
      if (doc.summary) {
        remember({ key: "document", value: doc.summary.slice(0, 240), source: "document" });
      }
    },
    [remember],
  );

  const rememberWatch = useCallback(
    (watch: WatchPayload) => {
      const value = watch.anchor_date ? `${watch.title} (${watch.anchor_date})` : watch.title;
      remember({ key: watch.kind, value: value.slice(0, 240), source: "watch" });
    },
    [remember],
  );

  const recall = useCallback(
    (query: string, limit = 6): string[] => {
      const tokens = query
        .toLowerCase()
        .split(/\W+/)
        .filter((token) => token.length > 2);
      const ranked = facts
        .map((fact) => {
          const blob = `${fact.key} ${fact.value}`.toLowerCase();
          const score = tokens.reduce((sum, token) => sum + (blob.includes(token) ? 1 : 0), 0);
          return { fact, score };
        })
        .filter((item) => item.score > 0 || tokens.length === 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);
      return ranked.map((item) => `${item.fact.key}: ${item.fact.value}`);
    },
    [facts],
  );

  return { facts, remember, rememberDocument, rememberWatch, recall };
}
