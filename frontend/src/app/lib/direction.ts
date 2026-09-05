export type TextDir = "ltr" | "rtl";
export type Locale = "en" | "fa";

/** Arabic / Persian / Hebrew blocks used for first-strong-character detection. */
const RTL_CHAR =
  /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LTR_CHAR = /[A-Za-z\u00C0-\u024F]/;

export function localeDir(locale: Locale): TextDir {
  return locale === "fa" ? "rtl" : "ltr";
}

/**
 * Detect composer direction from typed text.
 * Uses the first strong directional character so mixed drafts stay stable.
 */
export function detectTextDirection(
  text: string,
  fallback: TextDir = "ltr",
): TextDir {
  for (const ch of text) {
    if (RTL_CHAR.test(ch)) return "rtl";
    if (LTR_CHAR.test(ch)) return "ltr";
  }
  return fallback;
}
