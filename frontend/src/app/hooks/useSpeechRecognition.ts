"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Locale } from "../lib/direction";

export const SPEECH_LANG: Record<Locale, "fa-IR" | "en-GB"> = {
  en: "en-GB",
  fa: "fa-IR",
};

export type SpeechErrorCode =
  | "unsupported"
  | "not-allowed"
  | "no-speech"
  | "audio-capture"
  | "network"
  | "language-not-supported"
  | "aborted"
  | "unknown";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onresult: ((event: SpeechRecognitionResultLike) => void) | null;
};

type SpeechRecognitionErrorLike = {
  error?: string;
};

type SpeechRecognitionResultLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0?: { transcript?: string };
  }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const browserWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return (
    browserWindow.SpeechRecognition ??
    browserWindow.webkitSpeechRecognition ??
    null
  );
}

function mapError(code?: string): SpeechErrorCode {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "not-allowed";
    case "no-speech":
      return "no-speech";
    case "audio-capture":
      return "audio-capture";
    case "network":
      return "network";
    case "language-not-supported":
      return "language-not-supported";
    case "aborted":
      return "aborted";
    default:
      return "unknown";
  }
}

function joinTranscript(base: string, next: string): string {
  const left = base.trim();
  const right = next.trim();
  if (!left) return right;
  if (!right) return left;
  return `${left} ${right}`;
}

type UseSpeechRecognitionOptions = {
  locale: Locale;
  continuous?: boolean;
};

export function useSpeechRecognition({
  locale,
  continuous = true,
}: UseSpeechRecognitionOptions) {
  const lang = SPEECH_LANG[locale];
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const finalsRef = useRef("");
  const langRef = useRef(lang);

  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<SpeechErrorCode | null>(null);

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognitionCtor()));
  }, []);

  useEffect(() => {
    langRef.current = lang;
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.lang = lang;
    if (!shouldListenRef.current) return;
    finalsRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    try {
      recognition.stop();
    } catch {
      /* Chrome restarts from onend while shouldListenRef is true. */
    }
  }, [lang]);

  const release = useCallback(() => {
    shouldListenRef.current = false;
    setListening(false);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onresult = null;
    try {
      recognition.abort();
    } catch {
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("unsupported");
      setListening(false);
      return;
    }

    stopRequestedRef.current = false;
    shouldListenRef.current = true;
    finalsRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setError(null);

    const previous = recognitionRef.current;
    recognitionRef.current = null;
    if (previous) {
      previous.onstart = null;
      previous.onend = null;
      previous.onerror = null;
      previous.onresult = null;
      try {
        previous.abort();
      } catch {
        /* replace the session */
      }
    }

    const recognition = new Ctor();
    recognition.lang = langRef.current;
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      if (!shouldListenRef.current) return;
      setListening(true);
      setError(null);
    };

    recognition.onerror = (event) => {
      const code = mapError(event.error);
      if (code === "aborted" && stopRequestedRef.current) {
        return;
      }
      shouldListenRef.current = false;
      setListening(false);
      setError(code);
    };

    recognition.onresult = (event) => {
      let finalChunk = "";
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalChunk += text;
        else interim += text;
      }
      if (finalChunk) {
        finalsRef.current = joinTranscript(finalsRef.current, finalChunk);
      }
      setInterimTranscript(interim);
      setTranscript(joinTranscript(finalsRef.current, interim));
    };

    recognition.onend = () => {
      if (shouldListenRef.current && recognitionRef.current === recognition) {
        try {
          recognition.start();
          return;
        } catch {
          shouldListenRef.current = false;
        }
      }
      setListening(false);
    };

    try {
      recognition.start();
    } catch {
      setError("unknown");
      shouldListenRef.current = false;
      setListening(false);
    }
  }, [continuous]);

  const stop = useCallback(() => {
    stopRequestedRef.current = true;
    shouldListenRef.current = false;
    setListening(false);
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const toggle = useCallback(() => {
    if (shouldListenRef.current || listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(() => release, [release]);

  return {
    supported,
    listening,
    transcript,
    interimTranscript,
    error,
    lang,
    start,
    stop,
    toggle,
  };
}
