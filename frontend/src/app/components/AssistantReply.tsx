"use client";

import { useEffect, useRef, useState } from "react";

import {
  ApiError,
  getVoiceReadiness,
  speakText,
  type PillarId,
} from "@/services/api";

const PILLAR_TONE: Record<PillarId, string> = {
  delay_repay: "border-sky-500/25 bg-sky-400/10 text-sky-200",
  consumer_rights: "border-violet-500/25 bg-violet-400/10 text-violet-200",
  overdraft_shield: "border-emerald-500/25 bg-emerald-400/10 text-emerald-200",
};

type AssistantReplyProps = {
  title: string;
  message: string;
  steps: string[];
  pillar: PillarId;
  locale?: "en" | "fa";
  pending?: boolean;
  pendingLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function AssistantReply({
  title,
  message,
  steps,
  pillar,
  locale = "en",
  pending = false,
  pendingLabel = "EchoMind is thinking…",
  actionLabel,
  onAction,
}: AssistantReplyProps) {
  const [speaking, setSpeaking] = useState(false);
  const [cloudVoice, setCloudVoice] = useState<boolean | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // A cloud voice (Gemini-TTS, fa-IR preview) is used when one is
  // configured; otherwise the device voice is the fallback. The check
  // runs once and is cached — a 503 from /voice/speak also falls back.
  const hasCloudVoice = async (): Promise<boolean> => {
    if (cloudVoice !== null) return cloudVoice;
    try {
      const readiness = await getVoiceReadiness();
      const selected = readiness.selected !== "browser";
      setCloudVoice(selected);
      return selected;
    } catch {
      setCloudVoice(false);
      return false;
    }
  };

  const speakWithDevice = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale === "fa" ? "fa-IR" : "en-GB";
    utterance.rate = 1;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const toggleSpeech = async () => {
    if (speaking) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (canSpeak) window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const text = [message, ...steps].filter(Boolean).join(". ");
    if (!text.trim()) return;
    if (await hasCloudVoice()) {
      try {
        const blob = await speakText(text, locale);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setSpeaking(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
        };
        audio.onerror = () => {
          setSpeaking(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
          if (canSpeak) speakWithDevice(text);
        };
        setSpeaking(true);
        await audio.play();
        return;
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 503) {
          setCloudVoice(false);
        }
        // Fall through to the device voice.
      }
    }
    if (!canSpeak) return;
    speakWithDevice(text);
  };

  if (pending) {
    return (
      <article className="max-w-[85%] self-start rounded-3xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-300">
        <span className="flex items-center gap-2">
          <span className="echomind-typing" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          {pendingLabel}
        </span>
      </article>
    );
  }

  return (
    <article className="max-w-[90%] self-start rounded-3xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm leading-6 text-slate-200">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${PILLAR_TONE[pillar]}`}
        >
          {title}
        </span>
        {canSpeak ? (
          <button
            type="button"
            className="rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] font-semibold text-slate-300"
            onClick={toggleSpeech}
            aria-pressed={speaking}
          >
            {speaking ? (locale === "fa" ? "توقف صدا" : "Stop voice") : locale === "fa" ? "پخش صدا" : "Speak"}
          </button>
        ) : null}
      </div>
      <p className="text-slate-200">{message}</p>
      {steps.length > 0 ? (
        <ol className="mt-3 space-y-1.5 ps-4 text-slate-300">
          {steps.map((step, index) => (
            <li key={`${index}-${step.slice(0, 24)}`} className="list-decimal">
              {step}
            </li>
          ))}
        </ol>
      ) : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          className="mt-3 rounded-full border border-sky-500/30 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold text-sky-200"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
    </article>
  );
}
