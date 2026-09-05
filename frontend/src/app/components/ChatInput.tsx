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

  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);

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
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, []);

  useEffect(() => {
    resizeField();
  }, [value, resizeField]);

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

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const next = Array.from(list).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
    }));
    setAttachments((prev) => [...prev, ...next].slice(0, 6));
    setAttachOpen(false);
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
    onChange("");
    setAttachments([]);
    speechAnchorRef.current = "";
    requestAnimationFrame(resizeField);
  };

  return (
    <div className="pointer-events-none z-30 shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-4">
      <div className="pointer-events-auto mx-auto w-full max-w-3xl">
        {leading}
        {notice ? (
          <p
            className="mb-2 flex items-center justify-center gap-2 rounded-2xl border border-metal-line bg-navy/90 px-3 py-2 text-center text-xs text-slate-300 backdrop-blur-xl"
            role="status"
          >
            {listening ? <ListeningWave /> : null}
            <span>
              {notice}
              {listening ? ` · ${speechLang}` : ""}
            </span>
          </p>
        ) : null}

        {attachments.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-2">
            {attachments.map((item) => (
              <li
                key={item.id}
                className="flex max-w-full items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-200 backdrop-blur-xl"
              >
                <span className="truncate">{item.file.name}</span>
                <button
                  type="button"
                  className="rounded-full p-0.5 text-slate-400 hover:text-slate-100"
                  aria-label="Remove attachment"
                  onClick={() =>
                    setAttachments((prev) =>
                      prev.filter((entry) => entry.id !== item.id),
                    )
                  }
                >
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex items-end gap-2 rounded-3xl border border-metal-line bg-navy/90 p-2 shadow-lift backdrop-blur-xl">
          <div className="relative" ref={attachMenuRef}>
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/50 text-slate-300 transition hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
              aria-label={t.attach}
              aria-expanded={attachOpen}
              disabled={disabled}
              onClick={() => setAttachOpen((open) => !open)}
            >
              <IconPaperclip className="h-5 w-5" />
            </button>
            {attachOpen ? (
              <div
                className="absolute bottom-[calc(100%+0.5rem)] start-0 z-40 min-w-[10.5rem] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/95 shadow-xl backdrop-blur-xl"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm text-slate-200 hover:bg-slate-800/80"
                  onClick={() => cameraRef.current?.click()}
                >
                  <IconCamera className="h-4 w-4 text-sky-300" />
                  {t.camera}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm text-slate-200 hover:bg-slate-800/80"
                  onClick={() => fileRef.current?.click()}
                >
                  <IconPaperclip className="h-4 w-4 text-sky-300" />
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
            className={`max-h-32 min-h-[2.75rem] flex-1 resize-none bg-transparent px-1 py-2.5 text-[16px] leading-6 text-slate-100 placeholder:text-slate-500 focus:outline-none ${
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
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 ${
              listening
                ? "border-rose-400/50 bg-rose-500/20 text-rose-300"
                : "border-slate-800 bg-slate-950/50 text-slate-300 hover:text-sky-200"
            }`}
            aria-label={listening ? t.voiceStop : t.voiceStart}
            aria-pressed={listening}
            disabled={disabled}
            onClick={toggleListening}
          >
            {listening ? (
              <span className="echomind-mic-ring pointer-events-none absolute -inset-1 rounded-[1.15rem]" />
            ) : null}
            <IconMic className={`relative h-5 w-5 ${listening ? "echomind-pulse" : ""}`} />
          </button>

          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-500/30 bg-sky-400/15 text-sky-200 transition enabled:hover:bg-sky-400/25 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
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
