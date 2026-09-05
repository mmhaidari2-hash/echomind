"""Extract amounts, dates, and vendors from receipts, invoices, and train tickets."""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from app.schemas.documents import (
    ConsumerRightsPrefill,
    DelayRepayPrefill,
    DocumentKind,
    DocumentParseResponse,
    ExtractedEntities,
    OverdraftPrefill,
)
from app.services.delay_repay import OPERATORS

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
ALLOWED_MIME = {
    "text/plain",
    "text/markdown",
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/octet-stream",
}

_MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}

_STATIONS = (
    "London Euston",
    "London Kings Cross",
    "London Paddington",
    "London Waterloo",
    "London Victoria",
    "London Bridge",
    "Manchester Piccadilly",
    "Manchester Victoria",
    "Birmingham New Street",
    "Leeds",
    "Edinburgh",
    "Glasgow Central",
    "Glasgow Queen Street",
    "Cardiff Central",
    "Bristol Temple Meads",
    "York",
    "Newcastle",
    "Liverpool Lime Street",
    "Sheffield",
    "Nottingham",
    "Leicester",
    "Cambridge",
    "Oxford",
    "Reading",
    "Brighton",
    "Southampton Central",
    "Crewe",
    "Preston",
    "Stockport",
    "Coventry",
    "Milton Keynes",
)

_VENDORS = (
    "Argos",
    "Tesco",
    "Sainsbury",
    "Asda",
    "Amazon",
    "John Lewis",
    "Currys",
    "Currys PC World",
    "IKEA",
    "Apple",
    "Currys",
    "Boots",
    "Primark",
    "Marks & Spencer",
    "M&S",
    "Next",
    "AO.com",
    "Very",
    "eBay",
    "NatWest",
    "Barclays",
    "Lloyds",
    "HSBC",
    "Santander",
    "Monzo",
    "Starling",
)

_OPERATOR_ALIASES: list[tuple[str, tuple[str, ...]]] = [
    ("avanti", ("avanti", "west coast")),
    ("lner", ("lner", "london north eastern")),
    ("gwr", ("gwr", "great western")),
    ("tpe", ("transpennine", "tpe")),
    ("northern", ("northern rail", "northern")),
    ("crosscountry", ("crosscountry", "cross country")),
    ("emr", ("east midlands", "emr")),
    ("ga", ("greater anglia",)),
    ("scotrail", ("scotrail", "scot rail")),
    ("southeastern", ("southeastern",)),
    ("swr", ("south western", "swr")),
    ("southern", ("southern", "gtr", "thameslink")),
    ("chiltern", ("chiltern",)),
    ("c2c", ("c2c",)),
    ("elizabeth", ("elizabeth line", "tfl rail")),
    ("tflw", ("transport for wales", "tfw")),
    ("wmr", ("west midlands railway", "west midlands")),
]

_AMOUNT_RE = re.compile(
    r"(?:£|gbp\s*)(\d{1,5}(?:[.,]\d{2})?)|(\d{1,5}[.,]\d{2})\s*(?:gbp|pounds?)?",
    re.IGNORECASE,
)
_ISO_DATE_RE = re.compile(r"\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b")
_UK_DATE_RE = re.compile(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b")
_NAMED_DATE_RE = re.compile(
    r"\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
    r"\.?\s+(20\d{2}|\d{2})\b",
    re.IGNORECASE,
)
_DELAY_RE = re.compile(
    r"(?:delay(?:ed)?|late|mins?|minutes?)\D{0,12}(\d{1,3})|(\d{1,3})\s*(?:mins?|minutes?)\s*(?:late|delay)",
    re.IGNORECASE,
)
_REF_RE = re.compile(
    r"(?:pnr|booking|ref(?:erence)?|ticket(?:\s*no)?|order)\s*[:#]?\s*([A-Z0-9]{5,12})",
    re.IGNORECASE,
)
_FROM_TO_RE = re.compile(
    r"\b(?:from|dep(?:art)?)\s*[:\-]?\s*([A-Za-z][A-Za-z '&]{2,32})\s+"
    r"(?:to|arr(?:ive)?)\s*[:\-]?\s*([A-Za-z][A-Za-z '&]{2,32})",
    re.IGNORECASE,
)
_VENDOR_LINE_RE = re.compile(
    r"^(?:sold by|merchant|retailer|store|vendor|from)\s*[:\-]\s*(.+)$",
    re.IGNORECASE | re.MULTILINE,
)
_PDF_LITERAL = re.compile(rb"\((?:\\.|[^\\)]){2,}\)")
_ASCII_RUN = re.compile(rb"[\x20-\x7e]{4,}")


def _operator_lookup() -> dict[str, str]:
    return {item.id: item.name for item in OPERATORS}


def extract_text(data: bytes, filename: str = "", hint: str | None = None) -> str:
    chunks: list[str] = []
    if hint and hint.strip():
        chunks.append(hint.strip())
    if filename:
        stem = re.sub(r"[_\-.]+", " ", filename.rsplit(".", 1)[0])
        chunks.append(stem)

    decoded = _decode_bytes(data)
    if decoded:
        chunks.append(decoded)

    if data[:4] == b"%PDF" or filename.lower().endswith(".pdf"):
        pdf_text = _pdf_literals(data)
        if pdf_text:
            chunks.append(pdf_text)

    ascii_text = " ".join(match.group().decode("ascii", "ignore") for match in _ASCII_RUN.finditer(data))
    if ascii_text and len(ascii_text) > 12:
        chunks.append(ascii_text)

    joined = "\n".join(chunk for chunk in chunks if chunk.strip())
    return re.sub(r"[ \t]{2,}", " ", joined).strip()[:20000]


def _decode_bytes(data: bytes) -> str:
    if not data:
        return ""
    for encoding in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            text = data.decode(encoding)
        except UnicodeDecodeError:
            continue
        printable = sum(1 for char in text if char.isprintable() or char in "\n\r\t")
        if printable / max(len(text), 1) >= 0.75:
            return text
    return ""


def _pdf_literals(data: bytes) -> str:
    parts: list[str] = []
    for match in _PDF_LITERAL.finditer(data):
        raw = match.group()[1:-1].replace(rb"\(", b"(").replace(rb"\)", b")")
        try:
            parts.append(raw.decode("latin-1"))
        except UnicodeDecodeError:
            continue
    return " ".join(parts)


def _parse_amounts(text: str) -> list[Decimal]:
    found: list[Decimal] = []
    for match in _AMOUNT_RE.finditer(text):
        raw = (match.group(1) or match.group(2) or "").replace(",", "")
        try:
            value = Decimal(raw)
        except InvalidOperation:
            continue
        if Decimal("0.30") <= value <= Decimal("20000"):
            found.append(value)
    unique: list[Decimal] = []
    for value in found:
        if value not in unique:
            unique.append(value)
    return unique[:8]


def _normalise_date(year: int, month: int, day: int) -> str | None:
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def _year(raw: str) -> int:
    year = int(raw)
    if year < 100:
        year += 2000
    return year


def _parse_dates(text: str) -> list[str]:
    found: list[str] = []
    for match in _ISO_DATE_RE.finditer(text):
        parsed = _normalise_date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        if parsed:
            found.append(parsed)
    for match in _UK_DATE_RE.finditer(text):
        parsed = _normalise_date(_year(match.group(3)), int(match.group(2)), int(match.group(1)))
        if parsed:
            found.append(parsed)
    for match in _NAMED_DATE_RE.finditer(text):
        month = _MONTHS.get(match.group(2).lower().rstrip("."))
        if not month:
            continue
        parsed = _normalise_date(_year(match.group(3)), month, int(match.group(1)))
        if parsed:
            found.append(parsed)
    unique: list[str] = []
    for item in found:
        if item not in unique:
            unique.append(item)
    return unique[:6]


def _match_operator(text: str) -> tuple[str | None, str | None]:
    lowered = text.lower()
    names = _operator_lookup()
    for operator_id, aliases in _OPERATOR_ALIASES:
        if any(alias in lowered for alias in aliases):
            return operator_id, names.get(operator_id, operator_id)
    return None, None


def _match_stations(text: str) -> tuple[str | None, str | None]:
    hits = [station for station in _STATIONS if re.search(re.escape(station), text, re.IGNORECASE)]
    route = _FROM_TO_RE.search(text)
    if route:
        return route.group(1).strip().title(), route.group(2).strip().title()
    if len(hits) >= 2:
        return hits[0], hits[1]
    if len(hits) == 1:
        return hits[0], None
    return None, None


def _match_vendors(text: str) -> list[str]:
    found: list[str] = []
    line = _VENDOR_LINE_RE.search(text)
    if line:
        found.append(line.group(1).strip()[:80])
    for vendor in _VENDORS:
        if re.search(rf"\b{re.escape(vendor)}\b", text, re.IGNORECASE):
            found.append(vendor)
    unique: list[str] = []
    for item in found:
        if item and item not in unique:
            unique.append(item)
    return unique[:5]


def _ticket_type(text: str) -> str | None:
    lowered = text.lower()
    if "season" in lowered and "annual" in lowered:
        return "season_annual"
    if "season" in lowered and "month" in lowered:
        return "season_monthly"
    if "season" in lowered and "week" in lowered:
        return "season_weekly"
    if re.search(r"\breturn\b", lowered):
        return "return"
    if re.search(r"\bsingle\b", lowered):
        return "single"
    return None


def _delay_minutes(text: str) -> int | None:
    match = _DELAY_RE.search(text)
    if not match:
        return None
    raw = match.group(1) or match.group(2)
    minutes = int(raw)
    if 0 <= minutes <= 1440:
        return minutes
    return None


def _ticket_reference(text: str) -> str | None:
    match = _REF_RE.search(text)
    return match.group(1).upper() if match else None


def classify_kind(text: str, filename: str = "") -> DocumentKind:
    blob = f"{filename} {text}".lower()
    ticket_hits = len(
        re.findall(
            r"delay\s*repay|train|rail|ticket|pnr|off-peak|euston|piccadilly|avanti|lner|gwr",
            blob,
        )
    )
    bank_hits = len(re.findall(r"overdraft|unarranged|arranged fee|sort code|account ending", blob))
    invoice_hits = len(re.findall(r"invoice|vat|tax invoice", blob))
    receipt_hits = len(re.findall(r"receipt|retailer|order|purchased|total|vat", blob))
    scores = {
        DocumentKind.train_ticket: ticket_hits + (2 if _match_operator(text)[0] else 0),
        DocumentKind.bank_statement: bank_hits,
        DocumentKind.invoice: invoice_hits,
        DocumentKind.receipt: receipt_hits,
    }
    best = max(scores, key=scores.get)
    if scores[best] == 0:
        return DocumentKind.unknown
    return best


def parse_document(
    *,
    text: str,
    filename: str | None = None,
    locale: str = "en",
) -> DocumentParseResponse:
    source = text.strip()
    kind = classify_kind(source, filename or "")
    amounts = _parse_amounts(source)
    dates = _parse_dates(source)
    vendors = _match_vendors(source)
    operator_id, operator_name = _match_operator(source)
    origin, destination = _match_stations(source)
    ticket_type = _ticket_type(source)
    ticket_ref = _ticket_reference(source)
    delay = _delay_minutes(source)
    primary_amount = amounts[0] if amounts else None
    primary_date = dates[0] if dates else None
    vendor = vendors[0] if vendors else None

    entities = ExtractedEntities(
        amounts=amounts,
        dates=dates,
        vendors=vendors,
        operator_id=operator_id,
        operator_name=operator_name,
        origin=origin,
        destination=destination,
        ticket_type=ticket_type,
        ticket_reference=ticket_ref,
        delay_minutes=delay,
        item_description=None,
        passenger_name=None,
    )

    delay_prefill = None
    rights_prefill = None
    shield_prefill = None
    pillar: str | None = None

    if kind is DocumentKind.train_ticket or operator_id:
        pillar = "delay_repay"
        delay_prefill = DelayRepayPrefill(
            operator=operator_id,
            origin=origin,
            destination=destination,
            journey_date=primary_date,
            delay_minutes=delay,
            ticket_type=ticket_type or "single",
            ticket_cost=primary_amount,
            ticket_reference=ticket_ref,
            proof_filename=filename,
        )
    if kind in {DocumentKind.receipt, DocumentKind.invoice} or (vendor and not operator_id):
        pillar = pillar or "consumer_rights"
        item = None
        for line in source.splitlines():
            lowered = line.lower()
            if any(token in lowered for token in ("item", "goods", "product", "description")) and ":" in line:
                item = line.split(":", 1)[1].strip()[:180]
                break
        entities.item_description = item or (source.splitlines()[0][:80] if source else None)
        rights_prefill = ConsumerRightsPrefill(
            retailer_name=vendor,
            item_description=entities.item_description,
            purchase_date=primary_date,
            purchase_price=primary_amount,
            order_reference=ticket_ref,
            proof_filename=filename,
        )
    if kind is DocumentKind.bank_statement or re.search(r"overdraft|unarranged", source, re.IGNORECASE):
        pillar = pillar or "overdraft_shield"
        shield_prefill = OverdraftPrefill(
            bank_name=vendor if vendor in {"NatWest", "Barclays", "Lloyds", "HSBC", "Santander", "Monzo", "Starling"} else vendor,
            fee_amount=primary_amount,
            fee_date=primary_date,
            proof_filename=filename,
        )

    hits = len(amounts) + len(dates) + len(vendors) + (1 if operator_id else 0)
    confidence = min(0.95, 0.2 + hits * 0.12)
    summary = _summary(kind, entities, locale)
    return DocumentParseResponse(
        kind=kind,
        filename=filename,
        extracted_text=source[:1200],
        entities=entities,
        suggested_pillar=pillar,
        delay_repay=delay_prefill,
        consumer_rights=rights_prefill,
        overdraft_shield=shield_prefill,
        summary=summary,
        confidence=round(confidence, 2),
    )


def _summary(kind: DocumentKind, entities: ExtractedEntities, locale: str) -> str:
    amount = f"£{entities.amounts[0]}" if entities.amounts else None
    when = entities.dates[0] if entities.dates else None
    who = entities.operator_name or (entities.vendors[0] if entities.vendors else None)
    if locale == "fa":
        parts = [f"نوع سند: {kind.value}"]
        if who:
            parts.append(f"فروشنده/شرکت: {who}")
        if amount:
            parts.append(f"مبلغ: {amount}")
        if when:
            parts.append(f"تاریخ: {when}")
        return " · ".join(parts)
    parts = [kind.value.replace("_", " ")]
    if who:
        parts.append(who)
    if amount:
        parts.append(amount)
    if when:
        parts.append(when)
    return " · ".join(parts)


def parse_upload(data: bytes, filename: str, hint: str | None = None, locale: str = "en") -> DocumentParseResponse:
    text = extract_text(data, filename, hint)
    if not text:
        empty = DocumentParseResponse(
            kind=DocumentKind.unknown,
            filename=filename,
            extracted_text="",
            entities=ExtractedEntities(),
            suggested_pillar=None,
            summary="No readable text was found. Add a short caption or type the amount and date."
            if locale != "fa"
            else "متن خوانایی پیدا نشد. یک توضیح کوتاه یا مبلغ و تاریخ را بنویسید.",
            confidence=0.0,
        )
        return empty
    return parse_document(text=text, filename=filename, locale=locale)


def as_of_iso(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except ValueError:
        return None
