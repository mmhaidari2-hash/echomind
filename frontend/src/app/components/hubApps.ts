/**
 * The hub model — one source of truth for every hub surface.
 *
 * HomeHub (the home screen) and ConnectionsHub (the Local context
 * drawer) used to carry their own app lists: the drawer only had 5
 * apps, so Bank, Instagram and YouTube never appeared there even
 * though the connectors exist. Both hubs now render this list — all 8
 * apps — and load their states from the same real status endpoints.
 *
 * Nothing here is mocked: a state comes from a status endpoint, and
 * an endpoint that cannot be read leaves the app "unknown", which the
 * UI explains as "sign in to see status". Slack and Notion have no
 * connector, so they stay in the honest "coming soon" strip, never in
 * the orbit.
 */

import {
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_DOCS_SCOPE,
  GOOGLE_DRIVE_SCOPE,
  GOOGLE_GMAIL_SCOPE,
  GOOGLE_SHEETS_SCOPE,
  getBankStatus,
  getGoogleConnectorStatus,
  getInstagramStatus,
  getYouTubeStatus,
  startBankConnection,
  startGoogleConnection,
  startInstagramConnection,
  startYouTubeConnection,
} from "@/services/api";

export type HubState =
  | "connected"
  | "not_connected"
  | "needs_setup"
  | "coming_soon"
  | "unknown";

export type HubAppId =
  | "gmail"
  | "calendar"
  | "drive"
  | "docs"
  | "sheets"
  | "bank"
  | "instagram"
  | "youtube";

export type HubConnectKind =
  | "google"
  | "google-drive"
  | "google-docs"
  | "google-sheets"
  | "bank"
  | "instagram"
  | "youtube";

export type HubApp = {
  id: HubAppId;
  glyph: string;
  label: { en: string; fa: string };
  /** What this connection powers inside EchoMind — the "so what?". */
  powers: { en: string; fa: string };
  /** Shown when the state is needs_setup and the missing piece is server-side. */
  setupNote?: { en: string; fa: string };
  /** Which connect flow this app uses; null means no connect action. */
  connect: HubConnectKind | null;
};

export const HUB_APPS: HubApp[] = [
  {
    id: "gmail",
    glyph: "M",
    label: { en: "Gmail", fa: "جیمیل" },
    powers: {
      en: "Watches your inbox for train delays, refunds and renewals — and turns them into claims and follow-ups.",
      fa: "ایمیل‌های شما را برای تأخیر قطار، بازپرداخت و تمدید زیر نظر می‌گیرد و آن‌ها را به درخواست و پیگیری تبدیل می‌کند.",
    },
    setupNote: {
      en: "Google sign-in needs to be set up on the server first — then connect from here.",
      fa: "اول باید ورود با گوگل روی سرور راه‌اندازی شود — بعد از همین‌جا وصل کنید.",
    },
    connect: "google",
  },
  {
    id: "calendar",
    glyph: "31",
    label: { en: "Calendar", fa: "تقویم" },
    powers: {
      en: "Knows your journeys and deadlines, so Delay Repay claims and renewals never slip past their date.",
      fa: "سفرها و مهلت‌های شما را می‌داند، تا درخواست تأخیر قطار و تمدیدها از مهلتشان نگذرند.",
    },
    setupNote: {
      en: "Google sign-in needs to be set up on the server first — then connect from here.",
      fa: "اول باید ورود با گوگل روی سرور راه‌اندازی شود — بعد از همین‌جا وصل کنید.",
    },
    connect: "google",
  },
  {
    id: "drive",
    glyph: "D",
    label: { en: "Drive", fa: "درایو" },
    powers: {
      en: "Your tickets, receipts and documents, ready as evidence for claims and case files.",
      fa: "بلیت‌ها، رسیدها و مدارک شما، آماده به‌عنوان مدرک برای درخواست‌ها و پرونده‌ها.",
    },
    setupNote: {
      en: "Google sign-in needs to be set up on the server first — then connect from here.",
      fa: "اول باید ورود با گوگل روی سرور راه‌اندازی شود — بعد از همین‌جا وصل کنید.",
    },
    connect: "google-drive",
  },
  {
    id: "docs",
    glyph: "Doc",
    label: { en: "Docs", fa: "داکس" },
    powers: {
      en: "Claim letters and consumer-rights case files, drafted from your own evidence.",
      fa: "نامه‌های درخواست و پرونده‌های حقوق مصرف‌کننده، نوشته‌شده از روی مدارک خودتان.",
    },
    setupNote: {
      en: "Google sign-in needs to be set up on the server first — then connect from here.",
      fa: "اول باید ورود با گوگل روی سرور راه‌اندازی شود — بعد از همین‌جا وصل کنید.",
    },
    connect: "google-docs",
  },
  {
    id: "sheets",
    glyph: "S",
    label: { en: "Sheets", fa: "شیت" },
    powers: {
      en: "Tracks refunds, claims and renewals in one place, so nothing is forgotten.",
      fa: "بازپرداخت‌ها، درخواست‌ها و تمدیدها را در یک جا دنبال می‌کند، تا چیزی فراموش نشود.",
    },
    setupNote: {
      en: "Google sign-in needs to be set up on the server first — then connect from here.",
      fa: "اول باید ورود با گوگل روی سرور راه‌اندازی شود — بعد از همین‌جا وصل کنید.",
    },
    connect: "google-sheets",
  },
  {
    id: "bank",
    glyph: "£",
    label: { en: "Bank", fa: "بانک" },
    powers: {
      en: "Read-only: spots refunds, duplicate charges and renewal payments. EchoMind can never move money.",
      fa: "فقط خواندنی: بازپرداخت‌ها، برداشت‌های تکراری و پرداخت‌های تمدید را پیدا می‌کند. اکومایند هرگز نمی‌تواند پول جابه‌جا کند.",
    },
    setupNote: {
      en: "Needs a TrueLayer account on the server first — then you approve the bank's own consent screen.",
      fa: "اول باید حساب TrueLayer روی سرور راه‌اندازی شود — بعد شما صفحهٔ رضایت خود بانک را تأیید می‌کنید.",
    },
    connect: "bank",
  },
  {
    id: "instagram",
    glyph: "Ig",
    label: { en: "Instagram", fa: "اینستاگرام" },
    powers: {
      en: "Your posts and reels, read-only — so EchoMind can help with your content and your channels.",
      fa: "پست‌ها و ریل‌های شما، فقط خواندنی — تا اکومایند در محتوا و کانال‌هایتان به شما کمک کند.",
    },
    setupNote: {
      en: "Needs a Meta app (client id and secret) on the server first.",
      fa: "اول باید یک برنامهٔ متا (شناسه و رمز کاربری) روی سرور راه‌اندازی شود.",
    },
    connect: "instagram",
  },
  {
    id: "youtube",
    glyph: "▶",
    label: { en: "YouTube", fa: "یوتیوب" },
    powers: {
      en: "Your channel and videos, read-only — so EchoMind can help with your channel.",
      fa: "کانال و ویدیوهای شما، فقط خواندنی — تا اکومایند در کانالتان به شما کمک کند.",
    },
    setupNote: {
      en: "Google sign-in needs to be set up on the server first — then connect from here.",
      fa: "اول باید ورود با گوگل روی سرور راه‌اندازی شود — بعد از همین‌جا وصل کنید.",
    },
    connect: "youtube",
  },
];

export const HUB_COMING_SOON = [
  { glyph: "S", label: { en: "Slack", fa: "اسلک" } },
  { glyph: "N", label: { en: "Notion", fa: "نوشن" } },
] as const;

export type HubStates = Record<HubAppId, HubState>;

export function emptyHubStates(): HubStates {
  return {
    gmail: "unknown",
    calendar: "unknown",
    drive: "unknown",
    docs: "unknown",
    sheets: "unknown",
    bank: "unknown",
    instagram: "unknown",
    youtube: "unknown",
  };
}

/** Loads every app's state from its real status endpoint.
    `readFailed` is true only when every endpoint failed to answer —
    the UI then says the status could not be read, instead of guessing.
    `googleConfigured` is true only when the Google connector is set
    up on the server — the Connect button for Drive/Docs/Sheets must
    not appear before that, or it could only fail with a 503. */
export async function loadHubStatuses(): Promise<{
  states: HubStates;
  readFailed: boolean;
  googleConfigured: boolean;
}> {
  const next = emptyHubStates();
  let failures = 0;
  let googleConfigured = false;

  // Google — one account, per-scope truth. Base connect grants Gmail +
  // Calendar; Drive/Docs/Sheets are extra scopes requested on demand.
  try {
    const google = await getGoogleConnectorStatus();
    googleConfigured = google.configured;
    if (!google.configured) {
      next.gmail = next.calendar = next.drive = next.docs = next.sheets = "needs_setup";
    } else if (!google.connected) {
      next.gmail = next.calendar = next.drive = next.docs = next.sheets = "not_connected";
    } else {
      next.gmail = google.scopes.includes(GOOGLE_GMAIL_SCOPE) ? "connected" : "not_connected";
      next.calendar = google.scopes.includes(GOOGLE_CALENDAR_SCOPE)
        ? "connected"
        : "not_connected";
      next.drive = google.scopes.includes(GOOGLE_DRIVE_SCOPE) ? "connected" : "needs_setup";
      next.docs = google.scopes.includes(GOOGLE_DOCS_SCOPE) ? "connected" : "needs_setup";
      next.sheets = google.scopes.includes(GOOGLE_SHEETS_SCOPE) ? "connected" : "needs_setup";
    }
  } catch {
    // Not signed in (or the backend is unreachable): stay "unknown".
    failures += 1;
  }

  try {
    const bank = await getBankStatus();
    next.bank = !bank.configured ? "needs_setup" : bank.connected ? "connected" : "not_connected";
  } catch {
    // keep "unknown"
    failures += 1;
  }

  try {
    const instagram = await getInstagramStatus();
    next.instagram = !instagram.configured
      ? "needs_setup"
      : instagram.connected
        ? "connected"
        : "not_connected";
  } catch {
    // keep "unknown"
    failures += 1;
  }

  try {
    const youtube = await getYouTubeStatus();
    next.youtube = !youtube.configured
      ? "needs_setup"
      : youtube.connected
        ? "connected"
        : "not_connected";
  } catch {
    // keep "unknown"
    failures += 1;
  }

  return { states: next, readFailed: failures === 4, googleConfigured };
}

/** Opens the connect flow for one hub app; returns the sign-in URL. */
export async function startHubAppConnection(
  app: HubApp,
): Promise<{ authorization_url: string }> {
  switch (app.connect) {
    case "google":
      return startGoogleConnection("read");
    case "google-drive":
      return startGoogleConnection("read", [GOOGLE_DRIVE_SCOPE]);
    case "google-docs":
      return startGoogleConnection("read", [GOOGLE_DOCS_SCOPE]);
    case "google-sheets":
      return startGoogleConnection("read", [GOOGLE_SHEETS_SCOPE]);
    case "bank":
      return startBankConnection();
    case "instagram":
      return startInstagramConnection();
    case "youtube":
      return startYouTubeConnection();
    default:
      throw new Error("This app has no connect flow.");
  }
}

/** The Connect button is only offered when the tap can actually do
    something: "not connected" for every app, plus Drive/Docs/Sheets
    when only their scope is missing (the scope is requested from the
    already-connected Google account). When the missing piece is
    server-side, the setup note is the truth — no button that can
    only fail. `googleConfigured` gates the Drive/Docs/Sheets button:
    without the Google connector set up on the server, the connect
    flow would only answer 503. */
export function hubAppCanConnect(app: HubApp, state: HubState, googleConfigured: boolean): boolean {
  if (app.connect === null) return false;
  if (state === "connected" || state === "unknown") return false;
  if (state === "not_connected") return true;
  if (app.id === "drive" || app.id === "docs" || app.id === "sheets") {
    return googleConfigured;
  }
  return false;
}
