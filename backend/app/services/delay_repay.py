"""Delay Repay 15 calculation and UK TOC claim-draft generation."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from app.schemas.delay_repay import (
    DelayRepayClaimRequest,
    DelayRepayClaimResponse,
    DelayRepayOperator,
    DelayRepayTierInfo,
    DelayTier,
    TicketType,
)

CLAIM_DEADLINE_DAYS = 28
MONEY = Decimal("0.01")

OPERATORS: tuple[DelayRepayOperator, ...] = (
    DelayRepayOperator(id="avanti", name="Avanti West Coast", claim_url="https://www.avantiwestcoast.co.uk/help-and-support/delay-repay"),
    DelayRepayOperator(id="c2c", name="c2c", claim_url="https://www.c2c-online.co.uk/delay-repay/"),
    DelayRepayOperator(id="chiltern", name="Chiltern Railways", claim_url="https://www.chilternrailways.co.uk/delay-repay"),
    DelayRepayOperator(id="crosscountry", name="CrossCountry", claim_url="https://www.crosscountrytrains.co.uk/delay-repay"),
    DelayRepayOperator(id="emr", name="East Midlands Railway", claim_url="https://www.eastmidlandsrailway.co.uk/delay-repay"),
    DelayRepayOperator(id="elizabeth", name="Elizabeth line", claim_url="https://tfl.gov.uk/fares/refunds-and-replacements/delay-repay"),
    DelayRepayOperator(id="ga", name="Greater Anglia", claim_url="https://www.greateranglia.co.uk/delay-repay"),
    DelayRepayOperator(id="gwr", name="Great Western Railway", claim_url="https://www.gwr.com/help-and-support/delay-repay"),
    DelayRepayOperator(id="lner", name="LNER", claim_url="https://www.lner.co.uk/delay-repay/"),
    DelayRepayOperator(id="northern", name="Northern", claim_url="https://www.northernrailway.co.uk/delay-repay"),
    DelayRepayOperator(id="scotrail", name="ScotRail", claim_url="https://www.scotrail.co.uk/delay-repay"),
    DelayRepayOperator(id="southeastern", name="Southeastern", claim_url="https://www.southeasternrailway.co.uk/help-and-support/delay-repay"),
    DelayRepayOperator(id="swr", name="South Western Railway", claim_url="https://www.southwesternrailway.com/contact-and-help/refunds-and-compensation/delay-repay"),
    DelayRepayOperator(id="southern", name="Southern / GTR", claim_url="https://www.southernrailway.com/delay-repay"),
    DelayRepayOperator(id="tflw", name="Transport for Wales", claim_url="https://tfw.wales/help-and-contact/rail/delay-repay"),
    DelayRepayOperator(id="tpe", name="TransPennine Express", claim_url="https://www.tpexpress.co.uk/delay-repay"),
    DelayRepayOperator(id="wmr", name="West Midlands Railway", claim_url="https://www.westmidlandsrailway.co.uk/delay-repay"),
    DelayRepayOperator(id="other", name="Other UK operator", claim_url=None),
)

_TIER_META: dict[DelayTier, tuple[str, int, int | None, int, str]] = {
    DelayTier.not_eligible: (
        "Under 15 minutes",
        0,
        14,
        0,
        "National Rail Delay Repay 15 does not usually pay below 15 minutes.",
    ),
    DelayTier.band_15_29: (
        "15-29 minutes",
        15,
        29,
        25,
        "25% of the relevant single fare (or half a return).",
    ),
    DelayTier.band_30_59: (
        "30-59 minutes",
        30,
        59,
        50,
        "50% of the relevant single fare (or half a return).",
    ),
    DelayTier.band_60_plus: (
        "60+ minutes",
        60,
        119,
        100,
        "100% of the delayed single, or 50% of a return.",
    ),
    DelayTier.band_120_plus: (
        "2+ hours",
        120,
        None,
        100,
        "100% of a single, or the full return fare on a return ticket.",
    ),
}


def list_operators() -> list[DelayRepayOperator]:
    return list(OPERATORS)


def list_tiers() -> list[DelayRepayTierInfo]:
    rows: list[DelayRepayTierInfo] = []
    for tier, (label, low, high, percent, notes) in _TIER_META.items():
        if tier is DelayTier.not_eligible:
            continue
        rows.append(
            DelayRepayTierInfo(
                id=tier,
                label=label,
                minutes_min=low,
                minutes_max=high,
                percent=percent,
                notes=notes,
            )
        )
    return rows


def classify_tier(delay_minutes: int) -> DelayTier:
    if delay_minutes < 15:
        return DelayTier.not_eligible
    if delay_minutes < 30:
        return DelayTier.band_15_29
    if delay_minutes < 60:
        return DelayTier.band_30_59
    if delay_minutes < 120:
        return DelayTier.band_60_plus
    return DelayTier.band_120_plus


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


def daily_equivalent(ticket_type: TicketType, cost: Decimal) -> Decimal:
    if ticket_type is TicketType.season_weekly:
        return _money(cost / Decimal(7))
    if ticket_type is TicketType.season_monthly:
        return _money(cost / Decimal(30))
    if ticket_type is TicketType.season_annual:
        return _money(cost / Decimal(365))
    return _money(cost)


def compensation_basis(ticket_type: TicketType, cost: Decimal, tier: DelayTier) -> Decimal:
    cost = _money(cost)
    if ticket_type in {
        TicketType.season_weekly,
        TicketType.season_monthly,
        TicketType.season_annual,
    }:
        return daily_equivalent(ticket_type, cost)
    if ticket_type is TicketType.return_ticket:
        if tier is DelayTier.band_120_plus:
            return cost
        return _money(cost / Decimal(2))
    return cost


def estimate_payout(ticket_type: TicketType, cost: Decimal, tier: DelayTier) -> tuple[int, Decimal, Decimal]:
    _label, _low, _high, percent, _notes = _TIER_META[tier]
    basis = compensation_basis(ticket_type, cost, tier)
    estimate = _money(basis * Decimal(percent) / Decimal(100))
    return percent, basis, estimate


def _operator(operator_id: str) -> DelayRepayOperator:
    slug = operator_id.strip().lower()
    for item in OPERATORS:
        if item.id == slug or item.name.lower() == slug:
            return item
    return DelayRepayOperator(id=slug or "other", name=operator_id.strip() or "UK train operator")


def build_claim_draft(payload: DelayRepayClaimRequest, result: DelayRepayClaimResponse) -> str:
    operator = result.operator_name
    date_line = payload.journey_date.isoformat() if payload.journey_date else "the journey date"
    route = " to ".join(part for part in [payload.origin, payload.destination] if part) or "the delayed service"
    passenger = payload.passenger_name or "[Passenger name]"
    reference = payload.ticket_reference or "[Ticket / booking reference]"
    proof = payload.proof_filename or "ticket image or booking confirmation"
    times = []
    if payload.scheduled_arrival:
        times.append(f"scheduled arrival {payload.scheduled_arrival}")
    if payload.actual_arrival:
        times.append(f"actual arrival {payload.actual_arrival}")
    timing = f" ({', '.join(times)})" if times else ""

    if not result.eligible:
        return (
            f"To {operator} Delay Repay,\n\n"
            f"I travelled on {date_line} from {route} and was delayed by {payload.delay_minutes} minutes{timing}. "
            f"This is below the 15-minute National Rail Delay Repay 15 threshold, so I am checking whether "
            f"a goodwill payment or a different operator scheme still applies.\n\n"
            f"Ticket type: {payload.ticket_type.value}\n"
            f"Ticket cost: £{payload.ticket_cost}\n"
            f"Ticket proof: {reference} ({proof})\n\n"
            f"Yours sincerely,\n{passenger}\n"
        )

    return (
        f"To {operator} Delay Repay,\n\n"
        f"I am claiming compensation under Delay Repay 15 for a delayed journey on {date_line}.\n\n"
        f"Passenger: {passenger}\n"
        f"Operator: {operator}\n"
        f"Journey: {route}\n"
        f"Delay: {payload.delay_minutes} minutes{timing} (band {result.tier_label})\n"
        f"Ticket type: {payload.ticket_type.value}\n"
        f"Ticket cost: £{payload.ticket_cost}\n"
        f"Ticket / booking reference: {reference}\n"
        f"Proof attached: {proof}\n\n"
        f"Under National Rail Delay Repay guidelines this delay is in the {result.tier_label} band "
        f"({result.percent}% of the relevant fare). I estimate compensation of £{result.estimate_gbp}.\n\n"
        f"Please process this claim and confirm the refund method. I can provide bank details or "
        f"a refund to the original payment card through your Delay Repay form.\n\n"
        f"Yours sincerely,\n{passenger}\n"
    )


def _next_steps(eligible: bool, locale: str, claim_url: str | None) -> list[str]:
    if locale == "fa":
        if not eligible:
            return [
                "تأخیر زیر ۱۵ دقیقه معمولاً مشمول Delay Repay نیست.",
                "اگر اپراتور طرح جداگانه‌ای دارد، همان را در سایت شرکت بررسی کنید.",
                "بلیت و زمان‌بندی را نگه دارید اگر بعداً خواستید حسن‌نیت بخواهید.",
            ]
        steps = [
            "پیش‌نویس ادعا را کپی کنید و در فرم Delay Repay شرکت ریلی بفرستید.",
            "معمولاً تا ۲۸ روز پس از سفر فرصت دارید.",
            "تصویر بلیت یا ایمیل رزرو را پیوست کنید.",
        ]
        if claim_url:
            steps.append("از لینک رسمی فرم همان شرکت استفاده کنید.")
        return steps
    if not eligible:
        return [
            "Delays under 15 minutes are usually outside Delay Repay 15.",
            "Check whether this operator publishes a different goodwill scheme.",
            "Keep the ticket in case you still want to ask for a discretionary refund.",
        ]
    steps = [
        "Copy the claim draft into the operator's Delay Repay form.",
        "File within 28 days of the journey wherever the operator requires it.",
        "Attach the ticket image or booking confirmation used as proof.",
    ]
    if claim_url:
        steps.append("Use the operator's official Delay Repay link to submit.")
    return steps


def evaluate_claim(payload: DelayRepayClaimRequest) -> DelayRepayClaimResponse:
    operator = _operator(payload.operator)
    tier = classify_tier(payload.delay_minutes)
    percent, basis, estimate = estimate_payout(payload.ticket_type, payload.ticket_cost, tier)
    label, _low, _high, _percent, guideline = _TIER_META[tier]
    eligible = tier is not DelayTier.not_eligible
    response = DelayRepayClaimResponse(
        eligible=eligible,
        tier=tier,
        tier_label=label,
        delay_minutes=payload.delay_minutes,
        percent=percent,
        basis_amount=basis,
        estimate_gbp=estimate,
        guideline=guideline,
        claim_deadline_days=CLAIM_DEADLINE_DAYS,
        operator_id=operator.id,
        operator_name=operator.name,
        claim_url=operator.claim_url,
        claim_draft="",
        next_steps=_next_steps(eligible, payload.locale, operator.claim_url),
        ticket_type=payload.ticket_type,
        ticket_reference=payload.ticket_reference,
        proof_filename=payload.proof_filename,
    )
    response.claim_draft = build_claim_draft(payload, response)
    return response
