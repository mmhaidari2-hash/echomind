import { detectTextDirection, type Locale } from "./direction";

export type TravelServiceType =
  | "flight"
  | "train"
  | "hotel"
  | "taxi"
  | "bus"
  | "unknown";

export type TravelIntentKind = "book" | "claim" | "none";

export type ParsedTravelIntent = {
  kind: TravelIntentKind;
  destination: string | null;
  origin: string | null;
  date: string | null;
  serviceType: TravelServiceType;
  locale: Locale;
  raw: string;
  confidence: number;
};

type CityEntry = {
  id: string;
  aliases: string[];
};

const CITIES: CityEntry[] = [
  { id: "London", aliases: ["london", "لندن", "lon"] },
  { id: "Manchester", aliases: ["manchester", "منچستر", "manc"] },
  { id: "Birmingham", aliases: ["birmingham", "بیرمنگام"] },
  { id: "Leeds", aliases: ["leeds", "لیدز"] },
  { id: "Edinburgh", aliases: ["edinburgh", "ادینبرو", "ادینبورگ"] },
  { id: "Glasgow", aliases: ["glasgow", "گلاسگو"] },
  { id: "Paris", aliases: ["paris", "پاریس"] },
  { id: "Amsterdam", aliases: ["amsterdam", "آمستردام"] },
  { id: "Istanbul", aliases: ["istanbul", "استانبول"] },
  { id: "Dubai", aliases: ["dubai", "دبی", "dubaii"] },
  { id: "Tehran", aliases: ["tehran", "teheran", "تهران"] },
  { id: "Isfahan", aliases: ["isfahan", "esfahan", "اصفهان"] },
  { id: "Shiraz", aliases: ["shiraz", "شیراز"] },
  { id: "Mashhad", aliases: ["mashhad", "مشهد"] },
  { id: "New York", aliases: ["new york", "nyc", "نیویورک"] },
  { id: "Rome", aliases: ["rome", "رم"] },
  { id: "Madrid", aliases: ["madrid", "مادرید"] },
  { id: "Barcelona", aliases: ["barcelona", "بارسلونا"] },
];

const CLAIM_RE =
  /delay\s*repay|compensat|refund\s*(my\s*)?(train|ticket)|late\s+(train|flight)|cancelled\s+(train|flight)|تأخیر|تاخیر|غرامت|جبران/;

const BOOK_RE =
  /\b(book|reserve|get\s+me|wanna\s+go|want\s+to\s+go|fly(?:ing)?|hotel|taxi|uber|cab|train\s+to|flight\s+to|bus\s+to|crash\s+(at|in)|crib)\b|رزرو|هتل|تاکسی|اسنپ|اوبر|بلیط|بلیت|پرواز|هواپیما|بریم|می‌خوام\s+برم|ميخوام\s+برم|بگیر(?:م)?|بکوب/;

const FLIGHT_RE = /\b(flight|fly|plane|airport|ryanair|easyjet)\b|پرواز|هواپیما|فرودگاه/;
const TRAIN_RE = /\b(train|rail|avanti|tfl|station)\b|قطار|ریل|ایستگاه/;
const HOTEL_RE = /\b(hotel|stay|airbnb|room|crib|crash)\b|هتل|اقامت|اتاق/;
const TAXI_RE = /\b(taxi|cab|uber|lyft|minicab)\b|تاکسی|اسنپ|اوبر/;
const BUS_RE = /\b(bus|coach|national\s+express)\b|اتوبوس|کوچ/;

const DEST_PREFIX =
  /(?:\bto|\btowards|\bfor|\bin|\bat|به|تا|بریم|برو(?:یم)?|سمت|برای)\s+/i;

function normalize(text: string): string {
  return text
    .replace(/\u200c/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim();
}

function detectLocale(text: string, fallback: Locale): Locale {
  return detectTextDirection(text, fallback === "fa" ? "rtl" : "ltr") === "rtl"
    ? "fa"
    : fallback;
}

function findCity(haystack: string, skipId?: string | null): string | null {
  const lower = haystack.toLowerCase();
  let best: { id: string; index: number } | null = null;
  for (const city of CITIES) {
    if (skipId && city.id === skipId) continue;
    for (const alias of city.aliases) {
      const index = lower.indexOf(alias);
      if (index === -1) continue;
      const before = lower[index - 1];
      const after = lower[index + alias.length];
      const bounded =
        (index === 0 || !/[a-z0-9\u0600-\u06ff]/i.test(before ?? "")) &&
        (!after || !/[a-z0-9\u0600-\u06ff]/i.test(after));
      if (!bounded) continue;
      if (!best || index < best.index || alias.length > 2) {
        best = { id: city.id, index };
      }
    }
  }
  return best?.id ?? null;
}

function parseDate(text: string, now = new Date()): string | null {
  const lower = text.toLowerCase();
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const uk = text.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](20\d{2})\b/);
  if (uk) {
    const day = uk[1].padStart(2, "0");
    const month = uk[2].padStart(2, "0");
    return `${uk[3]}-${month}-${day}`;
  }

  const shift = (days: number) => {
    const next = new Date(now);
    next.setDate(next.getDate() + days);
    return next.toISOString().slice(0, 10);
  };

  if (/\btomorrow\b|فردا/.test(lower)) return shift(1);
  if (/\bday after\b|پس\s*فردا/.test(lower)) return shift(2);
  if (/\btonight\b|\btoday\b|امشب|امروز/.test(lower)) return shift(0);
  if (/\bnext week\b|هفته\s*(?:بعد|دیگه|دیگر)/.test(lower)) return shift(7);

  const weekdays: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    یکشنبه: 0,
    دوشنبه: 1,
    سه‌شنبه: 2,
    سهشنبه: 2,
    چهارشنبه: 3,
    پنجشنبه: 4,
    جمعه: 5,
    شنبه: 6,
  };
  for (const [name, target] of Object.entries(weekdays)) {
    if (!lower.includes(name)) continue;
    const delta = (target - now.getDay() + 7) % 7 || 7;
    return shift(delta);
  }
  return null;
}

function parseService(text: string): TravelServiceType {
  if (FLIGHT_RE.test(text)) return "flight";
  if (HOTEL_RE.test(text)) return "hotel";
  if (TAXI_RE.test(text)) return "taxi";
  if (BUS_RE.test(text)) return "bus";
  if (TRAIN_RE.test(text)) return "train";
  return "unknown";
}

function parseDestination(text: string): { destination: string | null; origin: string | null } {
  const prefixMatch = text.match(
    new RegExp(`${DEST_PREFIX.source}([\\w\\u0600-\\u06FF][\\w\\s\\u0600-\\u06FF-]{1,40})`, "i"),
  );
  const afterPrefix = prefixMatch?.[1] ?? "";
  const destination = findCity(afterPrefix) ?? findCity(text);
  const origin = destination ? findCity(text, destination) : findCity(text);
  return { destination, origin };
}

/**
 * Extract destination, date, and service type from free-form EN/FA (including slang).
 */
export function parseTravelIntent(
  query: string,
  locale: Locale = "en",
  now = new Date(),
): ParsedTravelIntent {
  const raw = query.trim().slice(0, 800);
  const text = normalize(raw);
  const resolvedLocale = detectLocale(text, locale);
  if (!text) {
    return {
      kind: "none",
      destination: null,
      origin: null,
      date: null,
      serviceType: "unknown",
      locale: resolvedLocale,
      raw,
      confidence: 0,
    };
  }

  const isClaim = CLAIM_RE.test(text);
  const isBook = BOOK_RE.test(text);
  const { destination, origin } = parseDestination(text);
  const date = parseDate(text, now);
  const serviceType = parseService(text);

  let kind: TravelIntentKind = "none";
  if (isClaim && !isBook) kind = "claim";
  else if (isBook || (destination && serviceType !== "unknown")) kind = "book";
  else if (isClaim) kind = "claim";

  let confidence = 0.15;
  if (kind !== "none") confidence += 0.25;
  if (destination) confidence += 0.3;
  if (date) confidence += 0.15;
  if (serviceType !== "unknown") confidence += 0.15;
  if (origin) confidence += 0.05;

  return {
    kind,
    destination,
    origin,
    date,
    serviceType,
    locale: resolvedLocale,
    raw,
    confidence: Math.min(1, Number(confidence.toFixed(2))),
  };
}

export function isBookableTravelIntent(intent: ParsedTravelIntent): boolean {
  return intent.kind === "book" && Boolean(intent.destination) && intent.confidence >= 0.4;
}
