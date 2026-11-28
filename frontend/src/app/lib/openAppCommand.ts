/**
 * "Open the app" commands — deterministic, local, no backend.
 *
 * Mahdi said "open the Instagram app" and EchoMind did nothing,
 * because the capability did not exist at all. This module is the
 * command side of round 8: it recognises an open-app command in
 * English or Persian and maps it to a known app. The launch itself
 * lives in services/appLauncher.ts.
 *
 * Rules, deliberately strict so chat messages never misfire:
 * - the WHOLE message must be the command (after trimming,
 *   lower-casing, Persian normalisation and stripping a leading
 *   "please" / «لطفا» and trailing punctuation);
 * - English: `open|launch [the] <name> [app]`, `go to <name>`;
 * - Persian: `<name> رو|را باز کن`, `باز کن <name>`, `<name> باز کن`,
 *   with an optional leading «اپ»;
 * - a name is matched EXACTLY (whole-word) against the table below.
 *   No substring matching: "open the drive to the airport" must
 *   stay a chat message, not open Google Drive. The one exception
 *   is bank: any name containing "bank" / «بانک» maps to the bank
 *   target, which is deliberately unmapped (there is no single bank
 *   app) so the UI can ask which bank app instead of guessing;
 * - an open-shaped message naming an app that is not in the table
 *   returns { kind: "unknown", name } so the UI can say so
 *   truthfully, instead of sending it to chat as if it were a
 *   question. Only names of one or two words count as unknown;
 *   longer text is not an open command at all and falls through
 *   to chat.
 *
 * No backend is involved: the live backend is stale and has no
 * Gemini key, so a command that needs the server would only fail.
 * The backend Persian intent layer (backend/app/services/persian.py,
 * services/intent.py) has no "open app" patterns to stay consistent
 * with — it only normalises text, detects language, and parses
 * dates and money.
 */

export type OpenAppId =
  | "instagram"
  | "youtube"
  | "gmail"
  | "drive"
  | "docs"
  | "sheets"
  | "calendar"
  | "bank";

export type OpenAppTarget = {
  id: OpenAppId;
  /** Android package name — the primary launch target.
      null means there is no single app to open (bank). */
  pkg: string | null;
  /** URL scheme fallback, tried only if the package launch fails.
      null means there is no known scheme. */
  scheme: string | null;
  label: { en: string; fa: string };
};

export const OPEN_APP_TARGETS: Record<OpenAppId, OpenAppTarget> = {
  instagram: {
    id: "instagram",
    pkg: "com.instagram.android",
    scheme: "instagram://",
    label: { en: "Instagram", fa: "اینستاگرام" },
  },
  youtube: {
    id: "youtube",
    pkg: "com.google.android.youtube",
    scheme: "vnd.youtube://",
    label: { en: "YouTube", fa: "یوتیوب" },
  },
  gmail: {
    id: "gmail",
    pkg: "com.google.android.gm",
    scheme: "googlegmail://",
    label: { en: "Gmail", fa: "جیمیل" },
  },
  drive: {
    id: "drive",
    pkg: "com.google.android.apps.docs",
    scheme: null,
    label: { en: "Drive", fa: "درایو" },
  },
  docs: {
    id: "docs",
    pkg: "com.google.android.apps.docs.editors.docs",
    scheme: null,
    label: { en: "Docs", fa: "داکس" },
  },
  sheets: {
    id: "sheets",
    pkg: "com.google.android.apps.docs.editors.sheets",
    scheme: null,
    label: { en: "Sheets", fa: "شیت" },
  },
  calendar: {
    id: "calendar",
    pkg: "com.google.android.calendar",
    scheme: null,
    label: { en: "Calendar", fa: "تقویم" },
  },
  bank: {
    id: "bank",
    pkg: null,
    scheme: null,
    label: { en: "Bank", fa: "بانک" },
  },
};

export type OpenAppCommand =
  | { kind: "open"; appId: OpenAppId }
  | { kind: "unknown"; name: string };

/** Exact names per app, in the language the user speaks. */
const NAMES: Array<{ appId: OpenAppId; names: string[] }> = [
  { appId: "instagram", names: ["instagram", "insta", "اینستاگرام", "اینستا"] },
  { appId: "youtube", names: ["youtube", "یوتیوب"] },
  { appId: "gmail", names: ["gmail", "جیمیل"] },
  { appId: "drive", names: ["drive", "google drive", "درایو"] },
  { appId: "docs", names: ["docs", "google docs", "داکس"] },
  { appId: "sheets", names: ["sheets", "google sheets", "شیت"] },
  { appId: "calendar", names: ["calendar", "google calendar", "تقویم", "کالندر"] },
  { appId: "bank", names: ["bank", "بانک"] },
];

function normalize(text: string): string {
  return text
    .replace(/[\u064A]/g, "ی") // Arabic Yeh -> Persian Yeh
    .replace(/[\u0643]/g, "ک") // Arabic Kaf -> Persian Kaf
    .replace(/[\u200C\u200D]/g, " ") // ZWNJ / ZWJ -> space
    .toLowerCase()
    .replace(/[.!?؟،,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripPleasantries(text: string): string {
  return text
    .replace(/^(please|لطفا|لطفاً)\s+/g, "")
    .replace(/\s+(please|لطفا|لطفاً)$/g, "")
    .trim();
}

function lookupName(name: string): OpenAppId | null {
  const cleaned = name.replace(/^اپ\s+/, "").trim();
  for (const entry of NAMES) {
    if (entry.names.includes(cleaned)) return entry.appId;
  }
  // Bank is the only substring match: "my bank", «بانکم», "banking".
  if (/\bbank\b/.test(cleaned) || cleaned.includes("بانک")) return "bank";
  return null;
}

/** Extract the app name from an open-shaped message, or null. */
function extractName(normalized: string): string | null {
  // English: open|launch [the] <name> [app]  /  go to <name>
  const en = normalized.match(
    /^(?:open|launch)\s+(?:the\s+)?(.+?)(?:\s+app)?$/,
  );
  if (en) return en[1].trim();
  const goTo = normalized.match(/^go to\s+(.+)$/);
  if (goTo) return goTo[1].trim();
  // Persian: <name> رو|را باز کن  /  باز کن <name>  /  <name> باز کن
  const faPost = normalized.match(/^(.+?)\s+(?:رو|را)\s+باز کن$/);
  if (faPost) return faPost[1].trim();
  const faPre = normalized.match(/^باز کن\s+(.+)$/);
  if (faPre) return faPre[1].trim().replace(/\s+(رو|را)$/, "");
  const faBare = normalized.match(/^(.+?)\s+باز کن$/);
  if (faBare) return faBare[1].trim();
  return null;
}

/**
 * Parse a whole message as an open-app command.
 * Returns the app to open, an unknown-name result for an open-shaped
 * message naming an app that is not in the table, or null when the
 * message is not an open command at all (it falls through to chat).
 */
export function parseOpenAppCommand(text: string): OpenAppCommand | null {
  const normalized = stripPleasantries(normalize(text));
  if (!normalized) return null;
  const name = extractName(normalized);
  if (name === null) return null;
  const appId = lookupName(name);
  if (appId) return { kind: "open", appId };
  // Unknown app — but only for a short name. Longer text is a chat
  // message that happens to start with "open", not a command.
  if (name.split(/\s+/).length <= 2) return { kind: "unknown", name };
  return null;
}
