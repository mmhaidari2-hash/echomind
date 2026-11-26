"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { copy } from "../lib/copy";
import { getPhotoService } from "../../services/photos";
import {
  detectTextDirection,
  localeDir,
  type Locale,
  type TextDir,
} from "../lib/direction";
import {
  useSpeechRecognition,
  type SpeechErrorCode,
} from "../hooks/useSpeechRecognition";

export type ChatAttachment = {
  id: string;
  file: File;
  /** Object URL for image thumbnails, revoked on remove/submit. */
  previewUrl?: string;
};

type ChatInputProps = {
  locale: Locale;
  value: string;
  onChange: (value: string) => void;
  onSend: (payload: { text: string; attachments: File[] }) => void;
  disabled?: boolean;
  leading?: ReactNode;
};

function IconMic({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect
        x="9"
        y="3.5"
        width="6"
        height="11"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M6.5 11.5a5.5 5.5 0 0 0 11 0"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M12 17v3.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPaperclip({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M8.5 12.5 15 6a3.2 3.2 0 1 1 4.5 4.5l-8.2 8.2a4.6 4.6 0 0 1-6.5-6.5l7.4-7.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPhoto({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect
        x="3.5"
        y="5"
        width="17"
        height="14"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="9" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="m5 17 4-4 3.5 3.5L16 13l3 3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCamera({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M8.2 7.2 9 5.5h6l.8 1.7H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.2Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.1" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function IconSend({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M4.4 11.1 19.2 4.6a.8.8 0 0 1 1.1.9l-3.8 14.4a.8.8 0 0 1-1.3.4l-4.4-3.7-2.5 2.5a.6.6 0 0 1-1-.4v-3.7Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconClose({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M7 7l10 10M17 7 7 17"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ListeningWave() {
  return (
    <span className="echomind-wave" aria-hidden>
      <span />
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

function speechNotice(
  t: (typeof copy)[Locale],
  listening: boolean,
  error: SpeechErrorCode | null,
): string | null {
  if (listening) return t.recording;
  if (!error || error === "aborted") return null;
  if (error === "unsupported") return t.speechUnsupported;
  if (error === "not-allowed") return t.micDenied;
  if (error === "no-speech") return t.speechNoSpeech;
  if (error === "network") return t.speechNetwork;
  if (error === "audio-capture") return t.speechAudio;
  return t.speechUnknown;
}

export default function ChatInput({
  locale,
  value,
  onChange,
  onSend,
  disabled = false,
  leading,
}: ChatInputProps) {
  const t = copy[locale];
  const fallbackDir = localeDir(locale);
  const dir: TextDir = useMemo(
    () => detectTextDirection(value, fallbackDir),
    [value, fallbackDir],
  );

  const fileInputId = useId();
  const cameraInputId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const speechAnchorRef = useRef("");
  /** Live mirror of `listening`, so the widget/notification handler
      below can tell whether a session is already running without
      re-subscribing on every state change. */
  const listeningRef = useRef(false);

  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  /** Shown when a photo could not be added — e.g. permission denied.
      Never claims access that was not granted. */
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);

  const {
    listening,
    transcript,
    error: speechError,
    lang: speechLang,
    start: startListening,
    stop: stopListening,
  } = useSpeechRecognition({ locale });

  const notice = speechNotice(t, listening, speechError);

  const canSend =
    !disabled && (value.trim().length > 0 || attachments.length > 0);

  const resizeField = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    // One clean line only: the dock never grows, long text scrolls
    // inside the field (mockups 1 & 3).
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 44)}px`;
  }, []);

  useEffect(() => {
    resizeField();
  }, [value, resizeField]);

  /** Raycast-style command bar: ⌘K focuses the composer from anywhere
      in the app (the chip next to the mic does the same on tap). */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        textareaRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!attachOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!attachMenuRef.current?.contains(event.target as Node)) {
        setAttachOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [attachOpen]);

  useEffect(() => {
    if (!listening) return;
    const prefix = speechAnchorRef.current.trim();
    const next = [prefix, transcript].filter(Boolean).join(" ");
    onChange(next);
  }, [listening, transcript, onChange]);

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  /** Home-screen widget / persistent notification / ?listen=1: start
      listening without hunting for the mic button. The request
      arrives as a window event when the app is already open, and as
      a sessionStorage flag (set by NativeShell before this component
      mounted) on a cold start from the widget — both funnel into the
      same start path as the mic button, and the existing error
      notice covers mic-denied / unsupported honestly. The flag is
      consumed once and expires after 60s, so a stale request never
      starts the mic on a later visit. */
  useEffect(() => {
    const FLAG = "echomind-listen-request";
    const consumeFlag = (): boolean => {
      try {
        const raw = window.sessionStorage.getItem(FLAG);
        if (!raw) return false;
        window.sessionStorage.removeItem(FLAG);
        return Date.now() - Number(raw) < 60_000;
      } catch {
        return false;
      }
    };
    const consumeUrlParam = (): boolean => {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get("listen") !== "1") return false;
        params.delete("listen");
        const query = params.toString();
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
        );
        return true;
      } catch {
        return false;
      }
    };
    const startIfRequested = () => {
      if (listeningRef.current) return;
      speechAnchorRef.current = textareaRef.current?.value ?? "";
      startListening();
    };
    const onRequest = () => startIfRequested();
    if (consumeFlag() || consumeUrlParam()) startIfRequested();
    window.addEventListener(FLAG, onRequest);
    return () => window.removeEventListener(FLAG, onRequest);
  }, [startListening]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent<boolean>("echomind-listening", { detail: listening }));
  }, [listening]);

  const addFilesList = (list: File[]) => {
    if (!list.length) return;
    const next = list.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      previewUrl: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined,
    }));
    setAttachments((prev) => [...prev, ...next].slice(0, 6));
    setAttachOpen(false);
  };

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    addFilesList(Array.from(list));
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const item = prev.find((entry) => entry.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((entry) => entry.id !== id);
    });
  };

  /** Photo library — native Capacitor Camera on the phone, the hidden
      file input on the web. A denied permission is reported honestly
      instead of pretending the photo was attached. */
  const pickPhotoFromLibrary = async () => {
    setAttachOpen(false);
    setPhotoNotice(null);
    const service = await getPhotoService();
    const result = await service.pickFromLibrary();
    if (result.ok) {
      addFilesList([result.file]);
      return;
    }
    if (result.reason === "denied") {
      setPhotoNotice(t.photoDenied);
      return;
    }
    if (result.reason === "error") {
      setPhotoNotice(t.photoError);
      return;
    }
    if (result.reason === "web-fallback") {
      fileRef.current?.click();
    }
    // "cancelled": the user closed the picker — nothing to say.
  };

  /** Camera capture — same shape as the library flow. */
  const takePhoto = async () => {
    setAttachOpen(false);
    setPhotoNotice(null);
    const service = await getPhotoService();
    const result = await service.takePhoto();
    if (result.ok) {
      addFilesList([result.file]);
      return;
    }
    if (result.reason === "denied") {
      setPhotoNotice(t.photoDenied);
      return;
    }
    if (result.reason === "error") {
      setPhotoNotice(t.photoError);
      return;
    }
    if (result.reason === "web-fallback") {
      cameraRef.current?.click();
    }
  };

  const toggleListening = () => {
    if (listening) {
      stopListening();
      return;
    }
    speechAnchorRef.current = value;
    startListening();
  };

  const submit = () => {
    if (!canSend) return;
    if (listening) stopListening();
    onSend({
      text: value.trim(),
      attachments: attachments.map((item) => item.file),
    });
    for (const item of attachments) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    onChange("");
    setAttachments([]);
    setPhotoNotice(null);
    speechAnchorRef.current = "";
    requestAnimationFrame(resizeField);
  };

  return (
    <div className="pointer-events-none z-30 shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-4">
      <div className="pointer-events-auto mx-auto w-full max-w-3xl">
        {leading}
        {notice ? (
          <p
            className="echomind-glass mb-2 flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-center text-xs text-ink-soft"
            role="status"
          >
            {listening ? <ListeningWave /> : null}
            <span>
              {notice}
              {listening ? ` · ${speechLang}` : ""}
            </span>
          </p>
        ) : null}

        {photoNotice ? (
          <p
            className="echomind-glass mb-2 rounded-2xl px-3 py-2 text-center text-xs text-ink-soft"
            role="status"
          >
            {photoNotice}
          </p>
        ) : null}

        {attachments.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-2">
            {attachments.map((item) => (
              <li
                key={item.id}
                className="echomind-chip-glass flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-ink-soft"
              >
                {item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="h-6 w-6 shrink-0 rounded-full object-cover"
                  />
                ) : null}
                <span className="truncate">{item.file.name}</span>
                <button
                  type="button"
                  className="rounded-full p-0.5 text-muted hover:text-ink"
                  aria-label="Remove attachment"
                  onClick={() => removeAttachment(item.id)}
                >
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="echomind-glass-blur flex min-h-[3.5rem] items-center gap-1 rounded-full px-2 py-1.5">
          <div className="relative shrink-0" ref={attachMenuRef}>
            <button
              type="button"
              aria-label={t.attach}
              aria-expanded={attachOpen}
              disabled={disabled}
              onClick={() => setAttachOpen((open) => !open)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 disabled:opacity-40"
            >
              <IconPaperclip className="h-5 w-5" />
            </button>
            {attachOpen ? (
              <div
                className="echomind-glass-blur absolute bottom-[calc(100%+0.5rem)] start-0 z-40 min-w-[10.5rem] overflow-hidden rounded-2xl"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm text-ink-soft hover:bg-white/[0.06]"
                  onClick={() => void pickPhotoFromLibrary()}
                >
                  <IconPhoto className="h-4 w-4 text-gold" />
                  {t.photoLibrary}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm text-ink-soft hover:bg-white/[0.06]"
                  onClick={() => void takePhoto()}
                >
                  <IconCamera className="h-4 w-4 text-gold" />
                  {t.takePhoto}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm text-ink-soft hover:bg-white/[0.06]"
                  onClick={() => fileRef.current?.click()}
                >
                  <IconPaperclip className="h-4 w-4 text-gold" />
                  {t.files}
                </button>
              </div>
            ) : null}
            <input
              id={fileInputId}
              ref={fileRef}
              type="file"
              className="hidden"
              accept="image/*,application/pdf,.txt,.md"
              multiple
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <input
              id={cameraInputId}
              ref={cameraRef}
              type="file"
              className="hidden"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </div>

          <label className="sr-only" htmlFor="echomind-composer">
            {t.placeholder}
          </label>
          <textarea
            id="echomind-composer"
            ref={textareaRef}
            dir={dir}
            lang={dir === "rtl" ? "fa" : "en"}
            rows={1}
            value={value}
            disabled={disabled}
            placeholder={t.placeholder}
            className={`max-h-11 min-h-[2.75rem] flex-1 resize-none overflow-y-auto whitespace-nowrap bg-transparent px-1 py-2.5 text-[16px] leading-6 text-ink placeholder:text-muted focus:outline-none ${
              dir === "rtl" ? "font-fa" : ""
            }`}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />

          <button
            type="button"
            aria-label={listening ? t.voiceStop : t.voiceStart}
            aria-pressed={listening}
            disabled={disabled}
            onClick={toggleListening}
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 disabled:opacity-40 ${
              listening ? "text-gold" : "text-muted hover:text-gold"
            }`}
          >
            {listening ? (
              <span className="echomind-mic-ring pointer-events-none absolute -inset-1 rounded-full" />
            ) : null}
            <IconMic className={`relative h-5 w-5 ${listening ? "echomind-pulse" : ""}`} />
          </button>

          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gold transition hover:text-gold-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={t.send}
            disabled={!canSend}
            onClick={submit}
          >
            <IconSend className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
