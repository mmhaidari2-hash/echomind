/**
 * Auto-inferred context — zero-friction suggestions for the blank
 * profile fields (Home station, Work station, Usual bank, Usual
 * retailer), derived ONLY from data EchoMind already holds about this
 * user: memory facts saved from parsed documents (operator, vendor)
 * and the Life Graph (obligation titles, promise counterparties).
 *
 * Nothing is invented: a suggestion exists only when a known UK
 * operator / bank / retailer name appears in the user's own stored
 * data. When nothing matches, the caller shows an honest "no
 * suggestions yet" state and the user types the value by hand.
 */

import type { LifeSnapshot, MemoryFact } from "@/services/api";

export type ContextField = "home_station" | "work_station" | "operator" | "bank" | "retailer";

export type ContextSuggestion = {
  field: ContextField;
  value: string;
  /** Where it came from, shown next to the chip. */
  source: "document" | "obligation" | "promise";
};

const UK_OPERATORS = [
  "Avanti West Coast",
  "London North Eastern Railway",
  "LNER",
  "Southern",
  "Thameslink",
  "Great Northern",
  "Southeastern",
  "South Western Railway",
  "Great Western Railway",
  "GWR",
  "CrossCountry",
  "Chiltern Railways",
  "East Midlands Railway",
  "Northern",
  "TransPennine Express",
  "Greater Anglia",
  "West Midlands Trains",
  "London Northwestern Railway",
  "c2c",
  "Heathrow Express",
  "Gatwick Express",
  "Elizabeth line",
  "London Underground",
  "TfL",
] as const;

const UK_BANKS = [
  "Barclays",
  "HSBC",
  "Lloyds",
  "Halifax",
  "NatWest",
  "Royal Bank of Scotland",
  "RBS",
  "Santander",
  "Monzo",
  "Starling",
  "Revolut",
  "Nationwide",
  "TSB",
  "Virgin Money",
  "First Direct",
  "Metro Bank",
  "Co-operative Bank",
  "Chase",
] as const;

const UK_RETAILERS = [
  "Amazon",
  "Tesco",
  "Sainsbury's",
  "Asda",
  "Morrisons",
  "Aldi",
  "Lidl",
  "Waitrose",
  "Argos",
  "Currys",
  "John Lewis",
  "Marks & Spencer",
  "M&S",
  "Boots",
  "Superdrug",
  "B&Q",
  "IKEA",
  "Next",
  "Primark",
  "Sports Direct",
  "Apple",
  "Samsung",
  "eBay",
] as const;

function findKnown(text: string, list: readonly string[]): string | null {
  const haystack = ` ${text.toLowerCase()} `;
  for (const name of list) {
    const needle = name.toLowerCase();
    // Word-boundary match so "Tesco" does not match "Tescoma".
    if (haystack.includes(` ${needle} `) || haystack.includes(` ${needle},`) || haystack.includes(` ${needle}.`)) {
      return name;
    }
  }
  return null;
}

function stationFrom(text: string): string | null {
  // "Richmond to Waterloo" / "London Waterloo" — the first station
  // named in a journey. Only used when it looks like a station name
  // (ends in a known suffix or is a known London terminus).
  const m = text.match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?)\s+(?:to|→|-)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)\b/);
  if (m) return m[1];
  return null;
}

/** Derive one-tap suggestions from the user's own stored data. */
export function deriveContextSuggestions(
  facts: MemoryFact[],
  snapshot: LifeSnapshot | null,
): ContextSuggestion[] {
  const out: ContextSuggestion[] = [];
  const seen = new Set<string>();
  const push = (field: ContextField, value: string, source: ContextSuggestion["source"]) => {
    const key = `${field}:${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ field, value, source });
  };

  // 1. Memory facts from parsed documents (operator / vendor keys).
  for (const fact of facts) {
    if (fact.key === "operator") {
      const op = findKnown(fact.value, UK_OPERATORS) ?? fact.value;
      push("operator", op, "document");
    }
    if (fact.key === "vendor") {
      const bank = findKnown(fact.value, UK_BANKS);
      if (bank) push("bank", bank, "document");
      const retailer = findKnown(fact.value, UK_RETAILERS);
      if (retailer) push("retailer", retailer, "document");
    }
    if (fact.key === "document") {
      const bank = findKnown(fact.value, UK_BANKS);
      if (bank) push("bank", bank, "document");
      const retailer = findKnown(fact.value, UK_RETAILERS);
      if (retailer) push("retailer", retailer, "document");
      const station = stationFrom(fact.value);
      if (station) push("home_station", station, "document");
    }
  }

  // 2. Life Graph: obligation titles + promise counterparties.
  if (snapshot) {
    for (const item of snapshot.obligations) {
      const bank = findKnown(item.title, UK_BANKS);
      if (bank) push("bank", bank, "obligation");
      const retailer = findKnown(item.title, UK_RETAILERS);
      if (retailer) push("retailer", retailer, "obligation");
      const station = stationFrom(item.title);
      if (station) push("home_station", station, "obligation");
    }
    for (const item of snapshot.promises) {
      const text = `${item.counterparty} ${item.promise}`;
      const op = findKnown(text, UK_OPERATORS);
      if (op) push("operator", op, "promise");
      const bank = findKnown(text, UK_BANKS);
      if (bank) push("bank", bank, "promise");
      const retailer = findKnown(text, UK_RETAILERS);
      if (retailer) push("retailer", retailer, "promise");
    }
  }

  return out;
}
