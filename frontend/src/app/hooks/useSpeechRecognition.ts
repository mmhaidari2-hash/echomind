"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Locale } from "../lib/direction";
import { isNativeApp } from "../lib/native";
import {
  createNativeSpeech,
  loadNativeSpeechPlugin,
  mergeLateFinal,
  type NativeSpeechCallbacks,
  type SpeechErrorCode,
  type SpeechServiceProbe,
} from "../../services/speech";

export type { SpeechErrorCode } from "../../services/speech";

export const SPEECH_LANG: Record<Locale, "fa-IR" | "en-GB"> = {
  en: "en-GB",
  fa: "fa-IR",
};

/** A native start that never fires `listeningState: "started"` is a
    stall, not "listening" — fail after this long. Shorter than the 8s
    watchdog so a hung recognizer fails fast with a real reason. */
const STARTED_GATE_MS = 4000;
/** Backstop for a start that never resolves and never calls back. */
const START_WATCHDOG_MS = 8000;

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
  /**
   * Fires once per listen period that produced text, when the session
   * ends (user stop, after the final-result harvest below). The
   * consumer auto-sends it as a chat message: hands-free means
   * speaking must ACT, not just fill the draft — Mahdi's round-5
   * report was "it hears my voice but does nothing afterwards".
   */
  onSessionEnd?: (text: string) => void;
};

/** The final onResults text arrives after stop() — wait this long for
    it before handing the finished utterance to the consumer. The
    plugin posts the stop to the WebView thread and the recognizer
    finalizes within a few hundred ms; 700ms covers it without the
    user feeling a lag. */
const FINAL_HARVEST_MS = 700;

export function useSpeechRecognition({
  locale,
  continuous = true,
  onSessionEnd,
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
  /** The last chunk appended to finalsRef for the CURRENT utterance.
      Partials are prefixes, not deltas — when the final onResults text
      arrives it extends this chunk, so it is REPLACED, not appended
      (see mergeLateFinal). Reset on every utterance restart / start. */
  const lastCommittedChunkRef = useRef("");
  /** Live mirror of the onSessionEnd callback (a ref so the stable
      stop() always calls the latest handler). */
  const onSessionEndRef = useRef(onSessionEnd);
  /** The final-result harvest timer (see stop()). */
  const harvestTimerRef = useRef(0);
  const langRef = useRef(lang);
  /**
   * Generation token — the fix for the round-3 race where the second
   * tap could not stop a hung start. Every start/stop/release bumps
   * it; every async continuation (start resolving, the started gate,
   * the watchdog, the continuous restart) checks it and kills its own
   * session when stale. A stop during a pending start therefore always
   * wins: the late-resolving start is released instead of leaving a
   * live session with no UI state.
   */
  const generationRef = useRef(0);
  /** The one-time on-device service probe (see the mount effect). */
  const serviceProbeRef = useRef<SpeechServiceProbe | null>(null);
  /** Last partial text not yet committed as final (native only). */
  const lastPartialRef = useRef("");
  /** The current session's final text was already committed (by a
      user stop or by the service's onFinal) — guards the double
      commit when both fire for the same utterance. */
  const committedRef = useRef(false);

  const [supported, setSupported] = useState(false);
  /** The availability probe has finished (so `supported === false`
      means "really unavailable", not "not checked yet"). */
  const [probed, setProbed] = useState(false);
  /** Full on-device service probe: Google service present, languages. */
  const [serviceProbe, setServiceProbe] = useState<SpeechServiceProbe | null>(null);
  const [listening, setListening] = useState(false);
  /** True between the tap and the recognizer actually starting (or
      failing). Without this the mic looks dead while the native
      start is still working — the user gets "Starting…" feedback
      immediately, and the gate/watchdog below turn a hung start into
      a visible error instead of silence. */
  const [starting, setStarting] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<SpeechErrorCode | null>(null);

  /** Live mirror of `listening` for the start watchdog. */
  const listeningRef = useRef(false);
  /** The start watchdog (see `start`): a recognizer start that never
      resolves and never calls back must fail visibly, not hang. */
  const startWatchdogRef = useRef(0);
  /** The "started" gate (see `runNativeStart`): a native start that
      resolves but never fires `listeningState: "started"` is a stall. */
  const startedGateRef = useRef(0);

  const clearStartWatchdog = useCallback(() => {
    if (startWatchdogRef.current) {
      window.clearTimeout(startWatchdogRef.current);
      startWatchdogRef.current = 0;
    }
  }, []);

  const clearStartedGate = useCallback(() => {
    if (startedGateRef.current) {
      window.clearTimeout(startedGateRef.current);
      startedGateRef.current = 0;
    }
  }, []);

  const clearHarvest = useCallback(() => {
    if (harvestTimerRef.current) {
      window.clearTimeout(harvestTimerRef.current);
      harvestTimerRef.current = 0;
    }
  }, []);

  useEffect(() => {
    onSessionEndRef.current = onSessionEnd;
  }, [onSessionEnd]);

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  useEffect(() => {
    if (getSpeechRecognitionCtor()) {
      setSupported(true);
      setProbed(true);
      return;
    }
    if (!isNativeApp()) {
      setProbed(true);
      return;
    }
    // No Web Speech here — probe the native recognizer instead.
    let cancelled = false;
    void loadNativeSpeechPlugin().then(async (plugin) => {
      if (cancelled) return;
      try {
        if (!plugin) return;
        const { available } = await plugin
          .available()
          .catch(() => ({ available: false }));
        if (!cancelled && available) setSupported(true);
      } finally {
        if (!cancelled) setProbed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Full service probe (native only, once, in the background): whether
  // the Google recognition service answers, and which languages it
  // reports. Used only to name the cause when a start stalls — never
  // to block the mic. Runs on its own service instance and is never
  // released (release stops the recognizer, which would kill a live
  // session); it registers no listeners, so there is nothing to clean.
  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    const probeService = createNativeSpeech({
      loadPlugin: loadNativeSpeechPlugin,
    });
    void probeService.probe().then((probe) => {
      if (cancelled) return;
      serviceProbeRef.current = probe;
      setServiceProbe(probe);
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
    generationRef.current += 1;
    shouldListenRef.current = false;
    setListening(false);
    setStarting(false);
    clearStartWatchdog();
    clearStartedGate();
    clearHarvest();
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
  }, [clearStartWatchdog, clearStartedGate, clearHarvest]);

  /** Name the cause of a stalled start from the service probe. */
  const stallError = useCallback((): SpeechErrorCode => {
    const probe = serviceProbeRef.current;
    if (!probe) return "stalled";
    if (!probe.available) return "service-missing";
    if (probe.googleService === "missing" || probe.googleService === "timeout") {
      return "service-missing";
    }
    if (
      probe.languages.length > 0 &&
      !probe.languages.includes(langRef.current)
    ) {
      return "language-not-supported";
    }
    return "stalled";
  }, []);

  /** Commit the pending partial as final, once per session. The merge
      replaces (not appends) when the pending text extends the chunk
      already committed for this utterance — partials are prefixes. */
  const commitPendingText = useCallback(() => {
    const text = lastPartialRef.current.trim();
    if (!text || committedRef.current) return;
    committedRef.current = true;
    finalsRef.current = mergeLateFinal(
      finalsRef.current,
      lastCommittedChunkRef.current,
      text,
    );
    lastCommittedChunkRef.current = text;
    setTranscript(finalsRef.current);
    setInterimTranscript("");
    lastPartialRef.current = "";
  }, []);

  /** Web Speech path (web fallback). The dispatcher below owns the reset. */
  const startWeb = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("unsupported");
      setListening(false);
      setStarting(false);
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
      setStarting(false);
      clearStartWatchdog();
      setError(null);
    };

    recognition.onerror = (event) => {
      const code = mapError(event.error);
      if (code === "aborted" && stopRequestedRef.current) {
        return;
      }
      shouldListenRef.current = false;
      setListening(false);
      setStarting(false);
      clearStartWatchdog();
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
      setStarting(false);
      clearStartWatchdog();
    }
  }, [continuous, clearStartWatchdog]);

  /** Native path (Android): the device recognizer via the Capacitor
      plugin. The dispatcher below owns the reset. */
  const runNativeStart = useCallback(async () => {
    const gen = generationRef.current;
    await nativeRef.current?.release().catch(() => undefined);
    if (generationRef.current !== gen) return;
    const native = createNativeSpeech({ loadPlugin: loadNativeSpeechPlugin });
    nativeRef.current = native;
    committedRef.current = false;
    lastPartialRef.current = "";
    const callbacks: NativeSpeechCallbacks = {
      onStarted: () => {
        if (generationRef.current !== gen) return;
        if (!shouldListenRef.current) return;
        setListening(true);
        setStarting(false);
        clearStartWatchdog();
        clearStartedGate();
        setError(null);
      },
      // Like the web onresult, partials commit unconditionally: the
      // final text of an utterance arrives here too, and must survive
      // a user-requested stop (shouldListen is already false then).
      // Stale generations are ignored so a late partial from a killed
      // session cannot pollute the next one.
      onPartial: (text) => {
        if (generationRef.current !== gen) return;
        lastPartialRef.current = text;
        setInterimTranscript(text);
        // The late final (onResults) arrives as a partial AFTER the
        // interim was already committed by onFinal — merge it so the
        // display never reads "hello hello world".
        setTranscript(
          mergeLateFinal(
            finalsRef.current,
            lastCommittedChunkRef.current,
            text,
          ),
        );
      },
      onFinal: (text) => {
        if (generationRef.current !== gen) return;
        if (committedRef.current) {
          lastPartialRef.current = "";
          return;
        }
        committedRef.current = true;
        emptyNativeSessionsRef.current = 0;
        finalsRef.current = mergeLateFinal(
          finalsRef.current,
          lastCommittedChunkRef.current,
          text,
        );
        lastCommittedChunkRef.current = text;
        setTranscript(finalsRef.current);
        setInterimTranscript("");
        lastPartialRef.current = "";
      },
      onStopped: (hadText) => {
        clearStartedGate();
        if (generationRef.current !== gen) return;
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
        // A stop that landed while restarting wins: the restarted
        // session is released instead of left live.
        committedRef.current = false;
        lastPartialRef.current = "";
        lastCommittedChunkRef.current = "";
        void native.start(langRef.current, callbacks).then((result) => {
          if (generationRef.current !== gen) {
            void native.release().catch(() => undefined);
            return;
          }
          if (result.ok) return;
          shouldListenRef.current = false;
          setListening(false);
          setError(result.code === "unsupported" ? "unknown" : result.code);
        });
      },
    };
    const result = await native.start(langRef.current, callbacks);
    if (generationRef.current !== gen) {
      // A stop landed while the start was pending: the stop wins.
      // Release the session the start just opened so nothing is left
      // listening with no UI state.
      await native.release().catch(() => undefined);
      if (nativeRef.current === native) nativeRef.current = null;
      return;
    }
    if (result.ok) {
      // Started gate: a resolved start is NOT proof of listening —
      // only `listeningState: "started"` is. If it never fires, the
      // service is stalled (zombie bind) and the session is killed.
      clearStartedGate();
      startedGateRef.current = window.setTimeout(() => {
        if (generationRef.current !== gen) return;
        if (!shouldListenRef.current || listeningRef.current) return;
        shouldListenRef.current = false;
        setListening(false);
        setStarting(false);
        setError(stallError());
        void native.release().catch(() => undefined);
        if (nativeRef.current === native) nativeRef.current = null;
      }, STARTED_GATE_MS);
      return;
    }
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
  }, [startWeb, clearStartWatchdog, clearStartedGate, stallError]);

  /** Native start. The hang watchdog lives in `start()` (one
      watchdog for both paths) — a native start that never resolves
      and never calls back is caught there. */
  const startNative = useCallback(async () => {
    setStarting(true);
    try {
      await runNativeStart();
    } finally {
      setStarting(false);
    }
  }, [runNativeStart]);

  /** One start path for every entry point (mic button, widget, Speak
      action): native on the phone, Web Speech on the web. */
  const start = useCallback(() => {
    generationRef.current += 1;
    stopRequestedRef.current = false;
    shouldListenRef.current = true;
    emptyNativeSessionsRef.current = 0;
    finalsRef.current = "";
    lastPartialRef.current = "";
    lastCommittedChunkRef.current = "";
    committedRef.current = false;
    clearHarvest();
    setTranscript("");
    setInterimTranscript("");
    setError(null);
    setStarting(true);
    // Watchdog (both paths): a recognizer start that never resolves
    // and never calls back — the plugin's start() hanging, or a web
    // recognizer that never fires onstart/onerror — would leave the
    // mic showing "Listening…" forever. After 8s with no start and
    // no error, fail visibly instead, naming the stall. Cleared by
    // onStarted/onstart, by onerror, and by stop/release.
    clearStartWatchdog();
    const gen = generationRef.current;
    startWatchdogRef.current = window.setTimeout(() => {
      if (generationRef.current !== gen) return;
      if (shouldListenRef.current && !listeningRef.current) {
        shouldListenRef.current = false;
        setListening(false);
        setStarting(false);
        setError(stallError());
        void nativeRef.current?.release().catch(() => undefined);
        nativeRef.current = null;
      }
    }, START_WATCHDOG_MS);
    if (isNativeApp()) {
      void startNative();
      return;
    }
    startWeb();
  }, [startNative, startWeb, clearStartWatchdog, stallError, clearHarvest]);

  const stop = useCallback(() => {
    generationRef.current += 1;
    stopRequestedRef.current = true;
    shouldListenRef.current = false;
    setListening(false);
    setStarting(false);
    clearStartWatchdog();
    clearStartedGate();
    // Commit the pending partial now: a zombied session may never
    // fire the "stopped" event that would commit it. The per-session
    // committed flag keeps a late onFinal from duplicating it.
    commitPendingText();
    void nativeRef.current?.stop().catch(() => undefined);
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    // FINAL HARVEST (round 7) — the fix for "it hears my voice but
    // does nothing afterwards". The plugin delivers the final onResults
    // matches as a LATE partialResults event, after stop() bumped the
    // generation — so the session's onPartial/onFinal rightly ignore
    // it, and commitPendingText() above could only save the last
    // INTERIM. Read the finished utterance back through the service
    // (takeLastText is not generation-guarded) and hand it to the
    // consumer once. If nothing arrived, the interim text committed
    // above is what the consumer gets; if nothing was ever heard,
    // nothing fires and the "no speech" notice is the answer.
    clearHarvest();
    harvestTimerRef.current = window.setTimeout(() => {
      harvestTimerRef.current = 0;
      const late = nativeRef.current?.takeLastText() ?? "";
      if (late) {
        finalsRef.current = mergeLateFinal(
          finalsRef.current,
          lastCommittedChunkRef.current,
          late,
        );
        lastCommittedChunkRef.current = late;
        setTranscript(finalsRef.current);
        lastPartialRef.current = "";
      }
      const text = finalsRef.current.trim();
      if (text) onSessionEndRef.current?.(text);
    }, FINAL_HARVEST_MS);
  }, [clearStartWatchdog, clearStartedGate, commitPendingText, clearHarvest]);

  const toggle = useCallback(() => {
    if (shouldListenRef.current || listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(() => release, [release]);

  return {
    supported,
    probed,
    serviceProbe,
    listening,
    starting,
    transcript,
    interimTranscript,
    error,
    lang,
    start,
    stop,
    toggle,
  };
}
