"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Locale } from "../lib/direction";
import { isNativeApp } from "../lib/native";
import {
  createNativeSpeech,
  loadNativeSpeechPlugin,
  type NativeSpeechCallbacks,
  type SpeechErrorCode,
} from "../../services/speech";

export type { SpeechErrorCode } from "../../services/speech";

export const SPEECH_LANG: Record<Locale, "fa-IR" | "en-GB"> = {
  en: "en-GB",
  fa: "fa-IR",
};

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
  /** The native recognizer session, when one is running. */
  const nativeRef = useRef<ReturnType<typeof createNativeSpeech> | null>(null);
  /** Consecutive native sessions that ended with no text (guard below). */
  const emptyNativeSessionsRef = useRef(0);
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
    if (getSpeechRecognitionCtor()) {
      setSupported(true);
      return;
    }
    if (!isNativeApp()) return;
    // No Web Speech here — probe the native recognizer instead.
    let cancelled = false;
    void loadNativeSpeechPlugin().then(async (plugin) => {
      if (cancelled || !plugin) return;
      const { available } = await plugin
        .available()
        .catch(() => ({ available: false }));
      if (!cancelled && available) setSupported(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    langRef.current = lang;
    if (!shouldListenRef.current) return;
    finalsRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.lang = lang;
      try {
        recognition.stop();
      } catch {
        /* Chrome restarts from onend while shouldListenRef is true. */
      }
      return;
    }
    // Native session: stop it; onStopped restarts it in the new language.
    if (nativeRef.current) {
      void nativeRef.current.stop().catch(() => undefined);
    }
  }, [lang]);

  const release = useCallback(() => {
    shouldListenRef.current = false;
    setListening(false);
    void nativeRef.current?.release().catch(() => undefined);
    nativeRef.current = null;
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

  /** Web Speech path (web fallback). The dispatcher below owns the reset. */
  const startWeb = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("unsupported");
      setListening(false);
      return;
    }

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

  /** Native path (Android): the device recognizer via the Capacitor
      plugin. The dispatcher below owns the reset. */
  const startNative = useCallback(async () => {
    await nativeRef.current?.release().catch(() => undefined);
    const native = createNativeSpeech({ loadPlugin: loadNativeSpeechPlugin });
    nativeRef.current = native;
    const callbacks: NativeSpeechCallbacks = {
      onStarted: () => {
        if (!shouldListenRef.current) return;
        setListening(true);
        setError(null);
      },
      // Like the web onresult, partials commit unconditionally: the
      // final text of an utterance arrives here too, and must survive
      // a user-requested stop (shouldListen is already false then).
      onPartial: (text) => {
        setInterimTranscript(text);
        setTranscript(joinTranscript(finalsRef.current, text));
      },
      onFinal: (text) => {
        emptyNativeSessionsRef.current = 0;
        finalsRef.current = joinTranscript(finalsRef.current, text);
        setTranscript(finalsRef.current);
        setInterimTranscript("");
      },
      onStopped: (hadText) => {
        if (!shouldListenRef.current) return;
        // The plugin reports errors only as a plain stop, so a session
        // that ends with no text is "no speech". Three empty sessions
        // in a row stop the loop instead of restarting the recognizer
        // forever (e.g. no network for the recognizer).
        if (!hadText) {
          emptyNativeSessionsRef.current += 1;
          if (emptyNativeSessionsRef.current >= 3) {
            shouldListenRef.current = false;
            setListening(false);
            setError("no-speech");
            return;
          }
        } else {
          emptyNativeSessionsRef.current = 0;
        }
        // Continuous: restart the same session (listeners stay
        // registered). A failed restart ends listening with its code.
        void native.start(langRef.current, callbacks).then((result) => {
          if (result.ok) return;
          shouldListenRef.current = false;
          setListening(false);
          setError(result.code === "unsupported" ? "unknown" : result.code);
        });
      },
    };
    const result = await native.start(langRef.current, callbacks);
    if (result.ok) return;
    nativeRef.current = null;
    await native.release().catch(() => undefined);
    if (result.code === "unsupported") {
      // No native recognizer here: fall through to Web Speech, which
      // reports "unsupported" honestly in a WebView.
      startWeb();
      return;
    }
    shouldListenRef.current = false;
    setListening(false);
    setError(result.code);
  }, [startWeb]);

  /** One start path for every entry point (mic button, widget, Speak
      action): native on the phone, Web Speech on the web. */
  const start = useCallback(() => {
    stopRequestedRef.current = false;
    shouldListenRef.current = true;
    emptyNativeSessionsRef.current = 0;
    finalsRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setError(null);
    if (isNativeApp()) {
      void startNative();
      return;
    }
    startWeb();
  }, [startNative, startWeb]);

  const stop = useCallback(() => {
    stopRequestedRef.current = true;
    shouldListenRef.current = false;
    setListening(false);
    void nativeRef.current?.stop().catch(() => undefined);
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
