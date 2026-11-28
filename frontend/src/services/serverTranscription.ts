/**
 * Server-side voice — the path that does not depend on the native
 * speech recognizer at all.
 *
 * VERIFIED PROBLEM (rounds 3–8): the native SpeechRecognizer
 * (@capacitor-community/speech-recognition) has failed on Mahdi's
 * Samsung in every round — it hears nothing, stalls, or pressing the
 * mic does nothing — and the failure cannot be reproduced headless.
 * This service records the utterance with MediaRecorder (plain web
 * audio capture in the WebView) and sends it to POST /voice/transcribe,
 * where Gemini transcribes it. The only native dependency left is
 * the microphone itself.
 *
 * PERMISSION (verified against the installed sources, round 9):
 * - RECORD_AUDIO IS declared in AndroidManifest.xml, and the native
 *   plugin path DOES request it at runtime (speech.ts: check →
 *   request → not-allowed). So "the app never asks" is FALSE — the
 *   permission is not the likely root cause of rounds 3–8.
 * - For THIS path the permission prompt comes from the WebView
 *   itself: Capacitor 7.6.9's BridgeWebChromeClient.onPermissionRequest
 *   handles AUDIO_CAPTURE by launching the runtime request for
 *   RECORD_AUDIO + MODIFY_AUDIO_SETTINGS and granting the WebView
 *   resources on grant. No manual request is needed — getUserMedia
 *   IS the request.
 * - The one permission wall that remains is a PERMANENT denial
 *   ("don't ask again"): getUserMedia then rejects NotAllowedError
 *   with no dialog, and this service reports it as "not-allowed"
 *   so the UI shows the Settings path (micDenied) instead of
 *   silence. The native plugin hits the same wall the same way.
 *
 * The service is injectable (same pattern as photos.ts /
 * appLauncher.ts): tests inject fake media devices, a fake
 * MediaRecorder and a stub transcribe function, and never touch a
 * real microphone or the network. The real transcribe function is
 * injected by the caller (the hook passes transcribeAudio from
 * api.ts), so this module has NO imports at all and stays
 * compilable in a plain Node test (api.ts uses the @/ alias, which
 * plain tsc cannot resolve).
 */

export type ServerTranscriptionLocale = "en" | "fa";

export type ServerRecordReason =
  | "not-allowed"
  | "no-mic"
  | "busy"
  | "unsupported"
  | "error"
  | "no-speech";

export type ServerRecordResult =
  | {
      ok: true;
      blob: Blob;
      mimeType: string;
      durationMs: number;
    }
  | { ok: false; reason: ServerRecordReason };

export type ServerTranscribeReason =
  | "key-missing"
  | "server-old"
  | "server-busy"
  | "bad-audio"
  | "sign-in"
  | "offline"
  | "timeout"
  | "error";

export type ServerTranscribeResult =
  | { ok: true; transcript: string }
  | { ok: false; reason: ServerTranscribeReason };

export type ServerTranscriptionDeps = {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  /** null when the runtime has no MediaRecorder (old WebView). */
  MediaRecorderClass:
    | (new (
        stream: MediaStream,
        options?: MediaRecorderOptions,
      ) => MediaRecorder)
    | null;
  isTypeSupported: (mimeType: string) => boolean;
  transcribe: (
    blob: Blob,
    locale: ServerTranscriptionLocale,
  ) => Promise<{ transcript: string }>;
};

/** Chrome on Android records Opus-in-WebM; Gemini's audio
    understanding accepts audio/webm (verified against Google's docs,
    round 9). ogg/mp4 are fallbacks for other WebViews. */
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

export function pickRecorderMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): string {
  for (const candidate of MIME_CANDIDATES) {
    try {
      if (isTypeSupported(candidate)) return candidate;
    } catch {
      // A throwing isTypeSupported means "unknown" — try the next one.
    }
  }
  return "";
}

export function createServerTranscription(deps: ServerTranscriptionDeps) {
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let mimeType = "";
  let startedAt = 0;

  function isSupported(): boolean {
    return (
      deps.MediaRecorderClass !== null &&
      typeof deps.getUserMedia === "function"
    );
  }

  function stopTracks(): void {
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          /* already stopped */
        }
      }
    }
    stream = null;
  }

  /**
   * Start recording. getUserMedia IS the permission request here —
   * Capacitor's WebView bridge shows the system dialog for
   * RECORD_AUDIO and grants the capture on allow. A permanent denial
   * rejects with NotAllowedError and no dialog: that is "not-allowed",
   * and the UI must show the Settings path.
   */
  async function start(): Promise<{ ok: true } | { ok: false; reason: ServerRecordReason }> {
    if (!isSupported()) return { ok: false, reason: "unsupported" };
    // A second start while recording must not abandon the first
    // recorder (leaking its stream) — report "busy" instead.
    if (recorder) return { ok: false, reason: "busy" };
    let media: MediaStream;
    try {
      media = await deps.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (error) {
      const name =
        error instanceof DOMException
          ? error.name
          : error instanceof Error
            ? error.name
            : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        return { ok: false, reason: "not-allowed" };
      }
      if (name === "NotFoundError" || name === "OverconstrainedError") {
        return { ok: false, reason: "no-mic" };
      }
      if (name === "NotReadableError" || name === "AbortError") {
        return { ok: false, reason: "busy" };
      }
      return { ok: false, reason: "error" };
    }
    stream = media;
    mimeType = pickRecorderMimeType(deps.isTypeSupported);
    chunks = [];
    const RecorderClass = deps.MediaRecorderClass;
    if (!RecorderClass) {
      stopTracks();
      return { ok: false, reason: "unsupported" };
    }
    const next = new RecorderClass(
      media,
      mimeType ? { mimeType } : undefined,
    );
    next.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    recorder = next;
    try {
      // Timeslice so chunks flow while recording (some WebViews
      // only deliver the blob on stop without one).
      recorder.start(250);
    } catch {
      recorder = null;
      stopTracks();
      return { ok: false, reason: "error" };
    }
    startedAt = Date.now();
    return { ok: true };
  }

  /** Stop recording and return the audio. An empty blob (nothing
      was captured) is "no-speech", not a success with empty audio. */
  async function stop(): Promise<ServerRecordResult> {
    const rec = recorder;
    if (!rec) return { ok: false, reason: "error" };
    const stopped = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });
    try {
      rec.stop();
    } catch {
      recorder = null;
      stopTracks();
      return { ok: false, reason: "error" };
    }
    await stopped;
    stopTracks();
    recorder = null;
    const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
    chunks = [];
    if (blob.size === 0) return { ok: false, reason: "no-speech" };
    return {
      ok: true,
      blob,
      mimeType: blob.type,
      durationMs: Date.now() - startedAt,
    };
  }

  /** Abort a recording in progress (unmount / a new start). */
  function release(): void {
    if (recorder) {
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
      recorder = null;
    }
    chunks = [];
    stopTracks();
  }

  /**
   * Send a recorded blob to the server and map the failure to a
   * reason the UI can name. The endpoint's error `code` decides —
   * a 404 means the live server is the older build without the
   * endpoint, a 503 with gemini_key_missing means the key is not
   * set, and a 401 means there is no signed-in session. Never a
   * fake transcript, never silence. The error is read
   * structurally (a `code` string + a numeric `status`) rather
   * than by `instanceof ApiError`, so this module has no static
   * import of api.ts and stays compilable in a plain Node test.
   */
  async function transcribe(
    blob: Blob,
    locale: ServerTranscriptionLocale,
  ): Promise<ServerTranscribeResult> {
    try {
      const result = await deps.transcribe(blob, locale);
      return { ok: true, transcript: result.transcript };
    } catch (error) {
      const apiError =
        typeof error === "object" &&
        error !== null &&
        typeof (error as { code?: unknown }).code === "string" &&
        typeof (error as { status?: unknown }).status === "number"
          ? (error as { status: number; code: string })
          : null;
      if (apiError) {
        if (apiError.code === "gemini_key_missing") {
          return { ok: false, reason: "key-missing" };
        }
        if (apiError.code === "endpoint_missing" || apiError.status === 404) {
          return { ok: false, reason: "server-old" };
        }
        if (apiError.code === "gemini_unavailable") {
          return { ok: false, reason: "server-busy" };
        }
        if (apiError.code === "transcribe_bad_audio") {
          return { ok: false, reason: "bad-audio" };
        }
        if (apiError.code === "phone_offline") {
          return { ok: false, reason: "offline" };
        }
        if (apiError.code === "timeout") {
          return { ok: false, reason: "timeout" };
        }
        if (apiError.status === 401 || apiError.code === "auth_session") {
          return { ok: false, reason: "sign-in" };
        }
        if (apiError.status === 503) {
          return { ok: false, reason: "server-busy" };
        }
      }
      return { ok: false, reason: "error" };
    }
  }

  return { isSupported, start, stop, release, transcribe };
}

let cached: ReturnType<typeof createServerTranscription> | null = null;

/** The real service, lazily built once. The transcribe function is
    injected by the caller (the hook passes transcribeAudio from
    api.ts) — this module has no import of api.ts at all, so it
    stays compilable in plain Node tests (api.ts uses the @/ alias,
    which plain tsc cannot resolve). */
export function getServerTranscription(
  transcribe: (
    blob: Blob,
    locale: ServerTranscriptionLocale,
  ) => Promise<{ transcript: string }>,
): ReturnType<typeof createServerTranscription> {
  if (cached) return cached;
  cached = createServerTranscription({
    getUserMedia: (constraints) =>
      navigator.mediaDevices.getUserMedia(constraints),
    MediaRecorderClass:
      typeof window !== "undefined" &&
      typeof window.MediaRecorder !== "undefined"
        ? window.MediaRecorder
        : null,
    isTypeSupported: (mimeType) => {
      try {
        return window.MediaRecorder?.isTypeSupported?.(mimeType) ?? false;
      } catch {
        return false;
      }
    },
    transcribe,
  });
  return cached;
}
