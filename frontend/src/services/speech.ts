/**
 * Native speech recognition — the mic that works on the phone.
 *
 * VERIFIED PROBLEM (round 3): the in-app mic button, the home-screen
 * widget and the notification Speak action all funnel into
 * `useSpeechRecognition`, which on native uses
 * @capacitor-community/speech-recognition (Android's SpeechRecognizer,
 * fa-IR, no popup). Android System WebView does NOT expose SpeechRecognition
 * (a Chrome-only API), so the native plugin is the only listen path on
 * the phone. RECORD_AUDIO was already in the Android manifest.
 *
 * ROUND 4 DIAGNOSIS — why start() hangs forever on Mahdi's Samsung
 * (verified against the installed @capacitor-community/speech-recognition
 * v7.0.1 sources in .verify-overhaul/frontend/node_modules):
 *
 * 1. `start()` resolves as soon as the native `startListening()` call is
 *    INVOICED, not when listening begins. With `partialResults: true`
 *    the plugin's `beginListening()` calls `call.resolve()` right after
 *    `startListening()` returns. Only the `listeningState: "started"`
 *    event (from `onBeginningOfSpeech`) proves the recognizer is alive.
 *    Round 3 treated a resolved start as "listening" — a hung service
 *    left the UI thinking it was listening until the 8s watchdog fired
 *    the generic "Voice input failed. Try again."
 * 2. Two silent-death paths where JS hears NOTHING: (a) `startListening()`
 *    returns but the service never calls back — a zombie bind, no
 *    onReady / onBeginningOfSpeech / onError; (b) `onError` fires after
 *    the call was already resolved, so the reject is dropped and NO
 *    "stopped" event is sent. Both end in the watchdog.
 * 3. The plugin's `stop()` NEVER resolves its PluginCall on the success
 *    path (no `call.resolve()` in `stop()`), so awaiting it hangs
 *    forever. Callers must fire-and-forget it.
 * 4. `beginListening()` destroys and recreates the SpeechRecognizer on
 *    EVERY start — the prime suspect for the zombie bind on Samsung.
 * 5. `getSupportedLanguages()` broadcasts to the Google app
 *    (`com.google.android.googlequicksearchbox`). If that app is
 *    missing/disabled the broadcast never returns and the promise hangs
 *    — so the probe below always runs it behind a timeout.
 * 6. `release()` used to only remove JS listeners and never stopped the
 *    native recognizer. A zombied session stayed hot, so the next start
 *    could hit ERROR_RECOGNIZER_BUSY and hang again. It now stops the
 *    recognizer FIRST (fire-and-forget), then removes the listeners.
 *
 * The hook owns the "started" gate and the watchdog; this service only
 * reports the facts (permission / availability / service probe) and
 * translates plugin failures into codes.
 *
 * The real plugin is loaded lazily (dynamic import) so this module is
 * importable in a plain Node test: tests inject a stub plugin through
 * createNativeSpeech() and never touch the native recognizer.
 */

export type SpeechErrorCode =
  | "unsupported"
  | "not-allowed"
  | "no-speech"
  | "audio-capture"
  | "network"
  | "language-not-supported"
  | "aborted"
  | "stalled"
  | "service-missing"
  | "unknown";

export type NativeSpeechPermissionState = "prompt" | "denied" | "granted";

/** The only surface this module needs from the native plugin. */
export type NativeSpeechPlugin = {
  available: () => Promise<{ available: boolean }>;
  checkPermissions: () => Promise<{
    speechRecognition: NativeSpeechPermissionState;
  }>;
  requestPermissions: () => Promise<{
    speechRecognition: NativeSpeechPermissionState;
  }>;
  /** Broadcasts to the Google app; may hang forever if it is missing. */
  getSupportedLanguages?: () => Promise<{ languages: string[] }>;
  start: (options: {
    language?: string;
    maxResults?: number;
    prompt?: string;
    popup?: boolean;
    partialResults?: boolean;
  }) => Promise<{ matches?: string[] }>;
  stop: () => Promise<void>;
  addListener: {
    (event: "partialResults", cb: (data: { matches: string[] }) => void): Promise<{
      remove: () => Promise<void>;
    }>;
    (event: "listeningState", cb: (data: { status: "started" | "stopped" }) => void): Promise<{
      remove: () => Promise<void>;
    }>;
  };
};

export type NativeSpeechCallbacks = {
  /** A session started (speech began). */
  onStarted: () => void;
  /** Live text — interim and final matches both arrive here. */
  onPartial: (text: string) => void;
  /** The last partial text, committed as final when the session ends. */
  onFinal: (text: string) => void;
  /** The session ended (utterance done, or an error ended it). */
  onStopped: (hadText: boolean) => void;
};

export type NativeSpeechStartResult =
  | { ok: true }
  | { ok: false; code: SpeechErrorCode };

/**
 * Merge a late final transcript into the committed finals.
 *
 * Partials are PREFIXES, not deltas: the final onResults text is the
 * COMPLETE utterance, so when it starts with the interim text already
 * committed, the committed prefix is REPLACED, not appended — otherwise
 * the user gets "hello hello world". When the late text is unrelated,
 * it is appended; when it is already there, nothing changes.
 */
export function mergeLateFinal(
  base: string,
  committedPartial: string,
  late: string,
): string {
  const clean = late.trim();
  if (!clean) return base;
  const committed = committedPartial.trim();
  const trimmedBase = base.trimEnd();
  if (
    committed &&
    trimmedBase.endsWith(committed) &&
    clean.startsWith(committed)
  ) {
    const stripped = trimmedBase
      .slice(0, trimmedBase.length - committed.length)
      .trimEnd();
    return stripped ? `${stripped} ${clean}` : clean;
  }
  if (trimmedBase.endsWith(clean)) return base;
  return trimmedBase ? `${trimmedBase} ${clean}` : clean;
}

/** One-time probe of the on-device recognition service. */
export type SpeechServiceProbe = {
  /** SpeechRecognizer.isRecognitionAvailable() on the device. */
  available: boolean;
  /** RECORD_AUDIO grant state at probe time (no request is made). */
  permission: NativeSpeechPermissionState;
  /** The Google recognition service behind getSupportedLanguages(). */
  googleService: "ok" | "missing" | "timeout" | "unchecked";
  /** Languages the service reports, when the call returned. */
  languages: string[];
};

export type NativeSpeechDeps = {
  loadPlugin: () => Promise<NativeSpeechPlugin | null>;
  /** Probe timeout for the Google-app broadcast. Default 5000 ms. */
  probeTimeoutMs?: number;
};

function mapStartError(message: string): SpeechErrorCode {
  const text = message.toLowerCase();
  if (/insufficient permissions|permission/i.test(text)) return "not-allowed";
  if (/network/i.test(text)) return "network";
  if (/no match|no speech/i.test(text)) return "no-speech";
  if (/audio/i.test(text)) return "audio-capture";
  if (/busy|recognizer/i.test(text)) return "unknown";
  return "unknown";
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([
    p,
    new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), ms),
    ),
  ]);
}

export function createNativeSpeech(deps: NativeSpeechDeps) {
  let pluginPromise: Promise<NativeSpeechPlugin | null> | null = null;
  let listeners: Array<{ remove: () => Promise<void> }> = [];
  let lastText = "";
  let sessionHadText = false;
  let probePromise: Promise<SpeechServiceProbe> | null = null;
  let probeCache: SpeechServiceProbe | null = null;

  async function ensurePlugin(): Promise<NativeSpeechPlugin | null> {
    if (!pluginPromise) {
      pluginPromise = deps.loadPlugin().catch(() => null);
    }
    return pluginPromise;
  }

  async function releaseListeners(): Promise<void> {
    const handles = listeners;
    listeners = [];
    for (const handle of handles) {
      await handle.remove().catch(() => undefined);
    }
  }

  /**
   * Probe the on-device recognition service without asking for anything.
   * Cached: the Google-app broadcast is slow and can hang, so it runs
   * once per service behind a timeout and the result is reused.
   */
  async function probe(): Promise<SpeechServiceProbe> {
    if (probeCache) return probeCache;
    if (probePromise) return probePromise;
    probePromise = (async () => {
      const native = await ensurePlugin();
      if (!native) {
        probeCache = {
          available: false,
          permission: "denied",
          googleService: "missing",
          languages: [],
        };
        return probeCache;
      }
      let available = false;
      try {
        available = (await native.available()).available;
      } catch {
        available = false;
      }
      let permission: NativeSpeechPermissionState = "denied";
      try {
        permission = (await native.checkPermissions()).speechRecognition;
      } catch {
        permission = "denied";
      }
      let googleService: SpeechServiceProbe["googleService"] = "unchecked";
      let languages: string[] = [];
      if (typeof native.getSupportedLanguages === "function") {
        const result = await withTimeout(
          native.getSupportedLanguages().catch(() => null),
          deps.probeTimeoutMs ?? 5000,
        );
        if (result === "timeout") {
          googleService = "timeout";
        } else if (result && Array.isArray(result.languages)) {
          googleService = "ok";
          languages = result.languages;
        } else {
          googleService = "missing";
        }
      }
      probeCache = { available, permission, googleService, languages };
      return probeCache;
    })();
    return probePromise;
  }

  /**
   * Start one native listening session. Safe to call again to restart
   * (listeners are registered once per service instance). Returns
   * "unsupported" when there is no recognizer — the caller then tries
   * Web Speech, which reports "unsupported" in a WebView. Any other
   * failure is reported with its own code.
   *
   * NOTE: a resolved start does NOT mean listening began — only the
   * `listeningState: "started"` event proves it. The hook gates on
   * that event; a start that never fires it is a "stalled" error.
   */
  async function start(
    language: string,
    callbacks: NativeSpeechCallbacks,
  ): Promise<NativeSpeechStartResult> {
    const native = await ensurePlugin();
    if (!native) return { ok: false, code: "unsupported" };

    try {
      let permission = await native.checkPermissions();
      if (permission.speechRecognition !== "granted") {
        permission = await native.requestPermissions();
      }
      if (permission.speechRecognition !== "granted") {
        return { ok: false, code: "not-allowed" };
      }
      const { available } = await native.available();
      if (!available) return { ok: false, code: "unsupported" };
    } catch {
      return { ok: false, code: "unsupported" };
    }

    lastText = "";
    sessionHadText = false;
    if (listeners.length === 0) {
      try {
        listeners.push(
          await native.addListener("partialResults", ({ matches }) => {
            const text = (matches?.[0] ?? "").trim();
            if (!text) return;
            lastText = text;
            sessionHadText = true;
            callbacks.onPartial(text);
          }),
          await native.addListener("listeningState", ({ status }) => {
            if (status === "started") {
              callbacks.onStarted();
              return;
            }
            if (lastText) callbacks.onFinal(lastText);
            const hadText = sessionHadText;
            lastText = "";
            sessionHadText = false;
            callbacks.onStopped(hadText);
          }),
        );
      } catch {
        await releaseListeners();
        return { ok: false, code: "unsupported" };
      }
    }

    try {
      // No popup: hands-free means no Google dialog in the way.
      // partialResults: live text while talking, final matches too.
      await native.start({
        language,
        maxResults: 1,
        popup: false,
        partialResults: true,
      });
    } catch (error) {
      return {
        ok: false,
        code: mapStartError(error instanceof Error ? error.message : String(error ?? "")),
      };
    }
    return { ok: true };
  }

  async function stop(): Promise<void> {
    const native = await ensurePlugin();
    if (!native) return;
    // The plugin's stop() NEVER resolves its PluginCall on the success
    // path — never await it, fire and forget. The "stopped" event (or
    // the hook's own commit) settles the transcript.
    void native.stop().catch(() => undefined);
  }

  async function release(): Promise<void> {
    const native = await ensurePlugin();
    if (native) {
      // Stop the native recognizer FIRST (fire-and-forget — it never
      // settles), otherwise a zombied session stays hot and the next
      // start can hit ERROR_RECOGNIZER_BUSY.
      void native.stop().catch(() => undefined);
    }
    lastText = "";
    sessionHadText = false;
    await releaseListeners();
  }

  /**
   * Read back the last matches[0] any partialResults event delivered
   * and clear it. The final onResults matches arrive as a
   * partialResults event AFTER the user stops — after the hook's
   * generation guard rightly stopped listening to the session's
   * callbacks — so the finished utterance is harvested through this
   * instead of being lost. Returns "" when nothing arrived.
   */
  function takeLastText(): string {
    const text = lastText;
    lastText = "";
    return text;
  }

  return { start, stop, release, probe, takeLastText };
}

/** The real plugin, loaded only on demand (never on the web). */
export async function loadNativeSpeechPlugin(): Promise<NativeSpeechPlugin | null> {
  try {
    const mod = await import("@capacitor-community/speech-recognition");
    return mod.SpeechRecognition as unknown as NativeSpeechPlugin;
  } catch {
    return null;
  }
}
