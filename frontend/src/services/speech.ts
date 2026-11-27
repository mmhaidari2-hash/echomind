/**
 * Native speech recognition — the mic that works on the phone.
 *
 * VERIFIED PROBLEM: the in-app mic button, the home-screen widget and
 * the notification Speak action all funnel into `useSpeechRecognition`,
 * which uses only the Web Speech API (`window.SpeechRecognition` /
 * `webkitSpeechRecognition`). Android System WebView does NOT expose
 * SpeechRecognition — it is a Chrome-only API — so on Mahdi's phone the
 * mic showed "Voice input is not supported in this browser." and did
 * nothing. The failure was visible, not silent, but hands-free voice —
 * the core demand — was broken at the root.
 *
 * FIX: on native, listen through @capacitor-community/speech-recognition
 * (Android's SpeechRecognizer, fa-IR, no popup so nothing interrupts
 * hands-free use). Web Speech stays the web fallback. RECORD_AUDIO was
 * already in the Android manifest.
 *
 * Plugin behaviour, verified against the installed v7.0.1 sources:
 * - `start({ partialResults: true, popup: false })` resolves as soon as
 *   listening begins; results arrive as `partialResults` events (both
 *   interim results and the final matches) and `listeningState`
 *   `started` / `stopped` marks the session ends.
 * - with partialResults on, a recognition error surfaces only as a
 *   `stopped` event (the start call was already resolved, so its
 *   rejection is lost) — the caller must treat a session that ends
 *   with no text as "no speech", not as a crash.
 * - `checkPermissions` / `requestPermissions` cover RECORD_AUDIO.
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

export type NativeSpeechDeps = {
  loadPlugin: () => Promise<NativeSpeechPlugin | null>;
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

export function createNativeSpeech(deps: NativeSpeechDeps) {
  let plugin: NativeSpeechPlugin | null = null;
  let listeners: Array<{ remove: () => Promise<void> }> = [];
  let lastText = "";
  let sessionHadText = false;

  async function ensurePlugin(): Promise<NativeSpeechPlugin | null> {
    if (!plugin) plugin = await deps.loadPlugin();
    return plugin;
  }

  async function releaseListeners(): Promise<void> {
    const handles = listeners;
    listeners = [];
    for (const handle of handles) {
      await handle.remove().catch(() => undefined);
    }
  }

  /**
   * Start one native listening session. Safe to call again to restart
   * (listeners are registered once per service instance). Returns
   * "unavailable" when there is no recognizer to fall back from — the
   * caller then tries Web Speech, which reports "unsupported" in a
   * WebView. Any other failure is reported with its own code.
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
    if (!plugin) return;
    await plugin.stop().catch(() => undefined);
  }

  async function release(): Promise<void> {
    await releaseListeners();
    plugin = null;
  }

  return { start, stop, release };
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
