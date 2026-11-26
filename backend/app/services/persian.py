"""Persian text handling: normalisation, language detection, entities.

Persian as people actually type it is messy: Arabic yeh/kaf (ي/ك) instead
of Persian (ی/ک), Persian digits (۰-۹), half-spaces (ZWNJ) in some words
and not in others, colloquial forms (میخوام, میشه, نمیخوام). Nothing
downstream can understand Persian reliably until the text is canonical.
This module is that canonical layer — no LLM, no network, pure text.

The rule: normalise once, match on the normalised form, keep the
original for display.
"""

from __future__ import annotations

import re
from datetime import date, timedelta

_ARABIC_YEH = "ي"
_PERSIAN_YEH = "ی"
_ARABIC_KEH = "ك"
_PERSIAN_KEH = "ک"
_ARABIC_TEH_MARBUTA = "ة"
_PERSIAN_HEH = "ه"
_ZWNJ = "‌"  # U+200C ZERO WIDTH NON-JOINER
_FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
_EN_DIGITS = "0123456789"
_FA_DIGIT_MAP = str.maketrans(_FA_DIGITS, _EN_DIGITS)
_AR_DIGITS = "٠١٢٣٤٥٦٧٨٩"
_AR_DIGIT_MAP = str.maketrans(_AR_DIGITS, _EN_DIGITS)

_PERSIAN_CHAR = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]")
_LATIN_CHAR = re.compile(r"[A-Za-z]")

# Colloquial -> written forms, applied on the normalised text. Only the
# forms that change matching; the original is never rewritten for display.
_COLLOQUIAL: tuple[tuple[str, str], ...] = (
    ("میخوام", "می خواهم"),
    ("میخوای", "می خواهی"),
    ("میخواد", "می خواهد"),
    ("میخوان", "می خواهند"),
    ("نمیخوام", "نمی خواهم"),
    ("نمیخواد", "نمی خواهد"),
    ("میشه", "می شود"),
    ("نمیشه", "نمی شود"),
    ("چیه", "چیست"),
    ("کجاست", "کجا است"),
    ("بگو", "بگو"),
    ("یادم بنداز", "یادآوری کن"),
    ("یادم بنداز", "یادآوری کن"),
)

_WEEKDAYS_FA: dict[str, int] = {
    # Python weekday(): Monday=0 ... Sunday=6
    "شنبه": 5,
    "یکشنبه": 6,
    "دوشنبه": 0,
    "سه شنبه": 1,
    "سهشنبه": 1,
    "چهارشنبه": 2,
    "پنجشنبه": 3,
    "جمعه": 4,
}

_RELATIVE_DAYS: tuple[tuple[str, int], ...] = (
    ("پس فردا", 2),
    ("پسفردا", 2),
    ("فردا", 1),
    ("امروز", 0),
    ("دیروز", -1),
    ("پریروز", -2),
)

_DAYS_AHEAD_RE = re.compile(r"(\d+)\s*روز\s*(دیگه|دیگر|بعد)")
_DAYS_AGO_RE = re.compile(r"(\d+)\s*روز\s*(پیش|قبل)")

_MONEY_RE = re.compile(r"£\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)")


def normalize_fa(text: str) -> str:
    """Canonical form for matching: Persian letters, Latin digits, no ZWNJ."""
    out = (text or "").strip()
    out = out.replace(_ARABIC_YEH, _PERSIAN_YEH)
    out = out.replace(_ARABIC_KEH, _PERSIAN_KEH)
    out = out.replace(_ARABIC_TEH_MARBUTA, _PERSIAN_HEH)
    out = out.translate(_FA_DIGIT_MAP).translate(_AR_DIGIT_MAP)
    out = out.replace(_ZWNJ, "")
    out = re.sub(r"\s+", " ", out)
    for colloquial, written in _COLLOQUIAL:
        out = out.replace(colloquial, written)
    return out.strip()


def detect_language(text: str) -> str:
    """'fa' when Persian/Arabic script dominates, else 'en'."""
    fa = len(_PERSIAN_CHAR.findall(text or ""))
    en = len(_LATIN_CHAR.findall(text or ""))
    if fa == 0 and en == 0:
        return "en"
    return "fa" if fa >= en else "en"


def parse_relative_date(text: str, today: date | None = None) -> date | None:
    """Parse Persian/English relative dates: today, tomorrow, weekdays,
    'in N days'. Returns None when no date is mentioned. Jalali month
    names are NOT converted (see docs/persian.md — a known limit)."""
    as_of = today or date.today()
    norm = normalize_fa(text)
    lower = norm.lower()
    for phrase, offset in _RELATIVE_DAYS:
        if phrase in norm:
            return as_of + timedelta(days=offset)
    match = _DAYS_AHEAD_RE.search(norm)
    if match:
        return as_of + timedelta(days=int(match.group(1)))
    match = _DAYS_AGO_RE.search(norm)
    if match:
        return as_of - timedelta(days=int(match.group(1)))
    for name, weekday in _WEEKDAYS_FA.items():
        if name in norm:
            delta = (weekday - as_of.weekday()) % 7
            return as_of + timedelta(days=delta if delta else 7)
    if "tomorrow" in lower:
        return as_of + timedelta(days=1)
    if "today" in lower:
        return as_of
    if "yesterday" in lower:
        return as_of - timedelta(days=1)
    match = re.search(r"in (\d+) days?", lower)
    if match:
        return as_of + timedelta(days=int(match.group(1)))
    return None


def parse_money_gbp(text: str) -> float | None:
    match = _MONEY_RE.search(normalize_fa(text))
    if not match:
        return None
    return float(match.group(1).replace(",", ""))
