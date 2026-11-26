"use client";

import { useCallback, useEffect, useState } from "react";

import { copy } from "../lib/copy";
import type { Locale } from "../lib/direction";
import {
  activateProvider,
  createProvider,
  deleteProvider,
  listProviders,
  testProvider,
  updateProvider,
  type ProviderSlot,
  type ProviderTestResult,
} from "@/services/api";

/**
 * Model provider slots: GPT (ChatGPT), Claude, Cursor, plus empty
 * slots the owner fills in himself. Keys are stored server-side and
 * never shown back — the panel only ever says whether a key is set.
 * A slot with no key (or no endpoint) says so and cannot be made
 * active; "Test" makes one cheap live call (GET {endpoint}/models)
 * and reports the real result.
 */
export default function ProvidersPanel({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const [slots, setSlots] = useState<ProviderSlot[] | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, { name: string; model: string; endpoint: string }>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      const rows = await listProviders();
      setSlots(rows);
      setReadFailed(false);
    } catch {
      setReadFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const markBusy = (id: string, value: boolean) =>
    setBusy((prev) => ({ ...prev, [id]: value }));
  const markNotice = (id: string, value: string) =>
    setNotice((prev) => ({ ...prev, [id]: value }));

  const saveKey = async (slot: ProviderSlot) => {
    const value = (keys[slot.id] ?? "").trim();
    if (!value) return;
    markBusy(slot.id, true);
    try {
      await updateProvider(slot.id, { api_key: value });
      setKeys((prev) => ({ ...prev, [slot.id]: "" }));
      markNotice(slot.id, t.providersKeySaved);
      await refresh();
    } catch {
      markNotice(slot.id, t.providersTestFail);
    } finally {
      markBusy(slot.id, false);
    }
  };

  const saveFields = async (slot: ProviderSlot) => {
    const draft = drafts[slot.id];
    if (!draft) return;
    markBusy(slot.id, true);
    try {
      await updateProvider(slot.id, {
        ...(slot.builtin ? {} : { name: draft.name }),
        model: draft.model,
        endpoint: draft.endpoint,
      });
      markNotice(slot.id, t.providersSaved);
      await refresh();
    } catch {
      markNotice(slot.id, t.providersTestFail);
    } finally {
      markBusy(slot.id, false);
    }
  };

  const onTest = async (slot: ProviderSlot) => {
    markBusy(slot.id, true);
    try {
      const result: ProviderTestResult = await testProvider(slot.id);
      markNotice(slot.id, result.ok ? t.providersTestOk : t.providersTestFail);
    } catch {
      markNotice(slot.id, t.providersTestFail);
    } finally {
      markBusy(slot.id, false);
    }
  };

  const onActivate = async (slot: ProviderSlot) => {
    markBusy(slot.id, true);
    try {
      await activateProvider(slot.id);
      await refresh();
    } catch {
      markNotice(slot.id, slot.has_key ? t.providersNeedsEndpoint : t.providersNeedsKey);
    } finally {
      markBusy(slot.id, false);
    }
  };

  const onDelete = async (slot: ProviderSlot) => {
    markBusy(slot.id, true);
    try {
      await deleteProvider(slot.id);
      await refresh();
    } finally {
      markBusy(slot.id, false);
    }
  };

  const onAdd = async () => {
    markBusy("add", true);
    try {
      await createProvider({ name: "", provider: "custom", model: "", endpoint: "" });
      await refresh();
    } finally {
      markBusy("add", false);
    }
  };

  const statusOf = (slot: ProviderSlot): string => {
    if (slot.is_active) return t.providersActive;
    if (!slot.has_key) return t.providersNeedsKey;
    if (!slot.has_endpoint) return t.providersNeedsEndpoint;
    return t.providersReady;
  };

  const statusClass = (slot: ProviderSlot): string => {
    if (slot.is_active) return "bg-honey/15 text-honey-deep border-honey/40";
    if (!slot.has_key || !slot.has_endpoint) return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  };

  const fieldFor = (slot: ProviderSlot) =>
    drafts[slot.id] ?? { name: slot.name, model: slot.model, endpoint: slot.endpoint };

  return (
    <section className="rounded-2xl border border-metal-line bg-cream p-4">
      <h3 className="font-serif text-base font-semibold text-bark">{t.providersTitle}</h3>
      <p className="mt-1 text-xs leading-relaxed text-clay">{t.providersHint}</p>
      {readFailed ? (
        <p className="mt-3 text-xs text-red-600">{t.providersUnavailable}</p>
      ) : slots === null ? (
        <p className="mt-3 text-xs text-clay">…</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {slots.map((slot) => {
            const isEmpty = !slot.builtin && !slot.name.trim();
            const draft = fieldFor(slot);
            const dirty =
              draft.name !== slot.name || draft.model !== slot.model || draft.endpoint !== slot.endpoint;
            return (
              <li key={slot.id} className="rounded-xl border border-metal-line bg-carbon p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-bark">
                    {isEmpty ? t.providersEmptySlot : slot.name}
                  </p>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(slot)}`}
                  >
                    {statusOf(slot)}
                  </span>
                </div>
                <div className="mt-2 flex flex-col gap-2">
                  {!slot.builtin && (
                    <label className="text-xs text-clay">
                      {t.providersName}
                      <input
                        type="text"
                        value={draft.name}
                        placeholder={t.providersEmptySlot}
                        onChange={(event) =>
                          setDrafts((prev) => ({ ...prev, [slot.id]: { ...draft, name: event.target.value } }))
                        }
                        className="mt-1 w-full rounded-lg border border-metal-line bg-cream px-2 py-1.5 text-sm text-bark"
                      />
                    </label>
                  )}
                  <label className="text-xs text-clay">
                    {t.providersModel}
                    <input
                      type="text"
                      value={draft.model}
                      placeholder="gpt-4o"
                      onChange={(event) =>
                        setDrafts((prev) => ({ ...prev, [slot.id]: { ...draft, model: event.target.value } }))
                      }
                      className="mt-1 w-full rounded-lg border border-metal-line bg-cream px-2 py-1.5 font-mono text-sm text-bark"
                    />
                  </label>
                  <label className="text-xs text-clay">
                    {t.providersEndpoint}
                    <input
                      type="text"
                      value={draft.endpoint}
                      placeholder="https://api.openai.com/v1"
                      onChange={(event) =>
                        setDrafts((prev) => ({ ...prev, [slot.id]: { ...draft, endpoint: event.target.value } }))
                      }
                      className="mt-1 w-full rounded-lg border border-metal-line bg-cream px-2 py-1.5 font-mono text-sm text-bark"
                    />
                  </label>
                  <label className="text-xs text-clay">
                    {t.providersApiKey}
                    {slot.has_key ? (
                      <span className="mt-1 block text-xs text-emerald-700">{t.providersKeySet}</span>
                    ) : null}
                    <span className="mt-1 flex gap-2">
                      <input
                        type="password"
                        value={keys[slot.id] ?? ""}
                        placeholder={t.providersApiKeyPlaceholder}
                        autoComplete="off"
                        onChange={(event) =>
                          setKeys((prev) => ({ ...prev, [slot.id]: event.target.value }))
                        }
                        className="min-w-0 flex-1 rounded-lg border border-metal-line bg-cream px-2 py-1.5 text-sm text-bark"
                      />
                      <button
                        type="button"
                        disabled={!(keys[slot.id] ?? "").trim() || busy[slot.id]}
                        onClick={() => void saveKey(slot)}
                        className="shrink-0 rounded-full border border-metal-line px-3 text-xs font-semibold text-bark-soft hover:text-honey-deep disabled:opacity-40"
                      >
                        {t.providersSaveKey}
                      </button>
                    </span>
                  </label>
                </div>
                {notice[slot.id] ? (
                  <p className="mt-2 text-xs text-clay">{notice[slot.id]}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {dirty ? (
                    <button
                      type="button"
                      disabled={busy[slot.id]}
                      onClick={() => void saveFields(slot)}
                      className="rounded-full bg-honey px-3 py-1.5 text-xs font-semibold text-cream disabled:opacity-40"
                    >
                      {t.providersSave}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={!slot.has_key || !slot.has_endpoint || busy[slot.id]}
                    onClick={() => void onTest(slot)}
                    className="rounded-full border border-metal-line px-3 py-1.5 text-xs font-semibold text-bark-soft hover:text-honey-deep disabled:opacity-40"
                  >
                    {t.providersTest}
                  </button>
                  {!slot.is_active ? (
                    <button
                      type="button"
                      disabled={!slot.has_key || !slot.has_endpoint || busy[slot.id]}
                      onClick={() => void onActivate(slot)}
                      className="rounded-full border border-metal-line px-3 py-1.5 text-xs font-semibold text-bark-soft hover:text-honey-deep disabled:opacity-40"
                    >
                      {t.providersActivate}
                    </button>
                  ) : null}
                  {!slot.builtin ? (
                    <button
                      type="button"
                      disabled={busy[slot.id]}
                      onClick={() => void onDelete(slot)}
                      className="rounded-full border border-metal-line px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-40"
                    >
                      {t.providersDelete}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        disabled={busy.add || slots === null}
        onClick={() => void onAdd()}
        className="mt-3 w-full rounded-full border border-metal-line px-3 py-2 text-xs font-semibold text-bark-soft hover:text-honey-deep disabled:opacity-40"
      >
        {t.providersAdd}
      </button>
    </section>
  );
}
