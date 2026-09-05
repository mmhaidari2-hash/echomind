"""Consumer Rights Act 2015 pathway engine and retailer notice drafts."""

from __future__ import annotations

from datetime import date

from app.schemas.consumer_rights import (
    ConsumerRightsPathwayInfo,
    ConsumerRightsRequest,
    ConsumerRightsResponse,
    DesiredRemedy,
    PriorRemedy,
    PurchaseKind,
    RightsPathway,
)

_PATHWAYS: dict[RightsPathway, tuple[str, str, str]] = {
    RightsPathway.short_term_reject: (
        "30-day right to reject",
        "0-30 days from delivery",
        "Full refund. The consumer rejects the goods and makes them available to the trader.",
    ),
    RightsPathway.repair_or_replace: (
        "Repair or replacement",
        "After 30 days, or if the consumer chooses not to reject",
        "One repair or replacement, at the trader's cost, in a reasonable time and without significant inconvenience.",
    ),
    RightsPathway.final_right_to_reject: (
        "Final right to reject",
        "After a failed or refused repair/replacement",
        "Refund. A deduction for use may apply only after 6 months (except where the Act disapplies it).",
    ),
    RightsPathway.price_reduction: (
        "Price reduction",
        "After a failed or refused repair/replacement",
        "Keep the goods and claim an appropriate reduction of the price.",
    ),
    RightsPathway.burden_shift_guidance: (
        "After 6 months",
        "More than 6 months from delivery",
        "Rights continue, but the consumer usually has to show the fault was present at delivery.",
    ),
}


def list_pathways() -> list[ConsumerRightsPathwayInfo]:
    return [
        ConsumerRightsPathwayInfo(id=key, label=label, window=window, notes=notes)
        for key, (label, window, notes) in _PATHWAYS.items()
    ]


def _delivery(payload: ConsumerRightsRequest) -> date:
    return payload.delivery_date or payload.purchase_date


def classify_pathway(
    days: int,
    prior: PriorRemedy,
    desired: DesiredRemedy,
) -> tuple[RightsPathway, DesiredRemedy]:
    failed_first_remedy = prior in {
        PriorRemedy.repair_attempted,
        PriorRemedy.replacement_attempted,
        PriorRemedy.trader_refused,
    }

    if days <= 30 and not failed_first_remedy:
        if desired in {DesiredRemedy.repair, DesiredRemedy.replacement}:
            return RightsPathway.repair_or_replace, desired
        return RightsPathway.short_term_reject, DesiredRemedy.refund

    if failed_first_remedy:
        if desired is DesiredRemedy.price_reduction:
            return RightsPathway.price_reduction, DesiredRemedy.price_reduction
        return RightsPathway.final_right_to_reject, DesiredRemedy.refund

    if days > 180:
        if desired is DesiredRemedy.refund:
            return RightsPathway.burden_shift_guidance, DesiredRemedy.refund
        if desired is DesiredRemedy.price_reduction:
            return RightsPathway.burden_shift_guidance, DesiredRemedy.price_reduction
        remedy = desired if desired in {DesiredRemedy.repair, DesiredRemedy.replacement} else DesiredRemedy.repair
        return RightsPathway.burden_shift_guidance, remedy

    if desired is DesiredRemedy.refund:
        return RightsPathway.repair_or_replace, DesiredRemedy.repair
    if desired is DesiredRemedy.price_reduction:
        return RightsPathway.repair_or_replace, DesiredRemedy.repair
    if desired in {DesiredRemedy.repair, DesiredRemedy.replacement}:
        return RightsPathway.repair_or_replace, desired
    return RightsPathway.repair_or_replace, DesiredRemedy.repair


def _statute_refs(kind: PurchaseKind, pathway: RightsPathway) -> list[str]:
    refs = ["Consumer Rights Act 2015"]
    if kind is PurchaseKind.services:
        refs.extend(["CRA 2015 s.49 (reasonable care and skill)", "CRA 2015 ss.54-56 (repeat performance / price reduction)"])
        return refs
    if kind is PurchaseKind.digital:
        refs.extend(["CRA 2015 ss.34-36 (digital content quality)", "CRA 2015 ss.42-45 (remedies)"])
        return refs
    refs.extend(
        [
            "CRA 2015 ss.9-11 (satisfactory quality, fit for purpose, as described)",
            "CRA 2015 s.19 (remedies for goods)",
        ]
    )
    if pathway is RightsPathway.short_term_reject:
        refs.append("CRA 2015 ss.20 and 22 (short-term right to reject, 30 days)")
    elif pathway is RightsPathway.repair_or_replace:
        refs.append("CRA 2015 s.23 (repair or replacement)")
    elif pathway is RightsPathway.final_right_to_reject:
        refs.append("CRA 2015 s.24 (final right to reject)")
    elif pathway is RightsPathway.price_reduction:
        refs.append("CRA 2015 s.24 (price reduction)")
    else:
        refs.append("CRA 2015 s.19(14)-(15) (6-month presumption)")
    return refs


def _summary(pathway: RightsPathway, remedy: DesiredRemedy, days: int, locale: str) -> tuple[str, str]:
    label, _window, notes = _PATHWAYS[pathway]
    if locale == "fa":
        summaries = {
            RightsPathway.short_term_reject: (
                f"از تحویل {days} روز گذشته و حق رد کوتاه‌مدت (۳۰ روز) هنوز باز است. می‌توانید کالای معیوب را رد کنید و بازپرداخت کامل بخواهید."
            ),
            RightsPathway.repair_or_replace: (
                f"{days} روز از تحویل گذشته. مسیر اصلی تعمیر یا تعویض با هزینه فروشنده است."
            ),
            RightsPathway.final_right_to_reject: (
                "تعمیر یا تعویض انجام نشده یا ناموفق بوده. می‌توانید حق رد نهایی یا کاهش قیمت را اعمال کنید."
            ),
            RightsPathway.price_reduction: (
                "پس از یک علاج ناموفق می‌توانید کالا را نگه دارید و کاهش مناسب قیمت بخواهید."
            ),
            RightsPathway.burden_shift_guidance: (
                f"{days} روز از تحویل گذشته (بیش از ۶ ماه). حقوق باقی است اما معمولاً باید ثابت کنید ایراد از ابتدا بوده است."
            ),
        }
        return summaries[pathway], notes
    summaries = {
        RightsPathway.short_term_reject: (
            f"{days} days since delivery. The 30-day short-term right to reject is still open, so you can reject the faulty goods and require a full refund."
        ),
        RightsPathway.repair_or_replace: (
            f"{days} days since delivery. The primary route is a repair or replacement at the trader's cost, in a reasonable time."
        ),
        RightsPathway.final_right_to_reject: (
            "A first repair or replacement was refused or did not work. You can now use the final right to reject or ask for a price reduction."
        ),
        RightsPathway.price_reduction: (
            "After a failed first remedy you may keep the goods and claim an appropriate price reduction."
        ),
        RightsPathway.burden_shift_guidance: (
            f"{days} days since delivery (over 6 months). Rights continue, but you usually need to show the fault was present at delivery."
        ),
    }
    extra = f" Recommended next ask: {remedy.value.replace('_', ' ')}."
    return summaries[pathway] + extra, notes


def _next_steps(pathway: RightsPathway, locale: str) -> list[str]:
    if locale == "fa":
        if pathway is RightsPathway.short_term_reject:
            return [
                "نامه را برای فروشنده بفرستید و کالا را برای جمع‌آوری آماده کنید.",
                "بازپرداخت کامل معمولاً ظرف ۱۴ روز پس از دریافت کالا انجام می‌شود.",
                "رسید، عکس ایراد و پیام‌های قبلی را نگه دارید.",
            ]
        if pathway is RightsPathway.final_right_to_reject:
            return [
                "نامه حق رد نهایی را بفرستید و مهلت پاسخ ۱۴ روزه بگذارید.",
                "اگر نپذیرفت، ADR، صادرکننده کارت یا Citizens Advice را در نظر بگیرید.",
                "پس از ۶ ماه ممکن است کسر بابت استفاده اعمال شود.",
            ]
        if pathway is RightsPathway.burden_shift_guidance:
            return [
                "شواهد بدهید که ایراد از زمان تحویل وجود داشته (گزارش تعمیر، عکس، نظر کارشناس).",
                "ابتدا تعمیر یا تعویض بخواهید مگر اینکه نامتناسب باشد.",
                "اگر فروشنده نپذیرفت به ADR یا Trading Standards مراجعه کنید.",
            ]
        return [
            "از فروشنده بخواهید ظرف زمان معقول و بدون زحمت قابل توجه تعمیر یا تعویض کند.",
            "هزینه پست برگشتی و کار باید با فروشنده باشد.",
            "اگر علاج اول شکست خورد، نامه حق رد نهایی تولید کنید.",
        ]
    if pathway is RightsPathway.short_term_reject:
        return [
            "Send the notice and make the goods available for collection.",
            "A full refund is due within 14 days of the trader receiving the goods back.",
            "Keep the receipt, photos of the fault, and any earlier messages.",
        ]
    if pathway is RightsPathway.final_right_to_reject:
        return [
            "Send the final-right-to-reject letter and give 14 days to respond.",
            "If refused, use ADR, your card issuer, or Citizens Advice / Trading Standards.",
            "After 6 months the trader may deduct a fair amount for use.",
        ]
    if pathway is RightsPathway.burden_shift_guidance:
        return [
            "Gather evidence the fault was present at delivery (repair report, photos, expert view).",
            "Ask for repair or replacement first unless that is impossible or disproportionate.",
            "Escalate to ADR or Trading Standards if the trader will not engage.",
        ]
    return [
        "Require a repair or replacement in a reasonable time, at the trader's cost.",
        "Do not accept being charged for return postage on a faulty claim.",
        "If the first remedy fails or is refused, generate a final-right-to-reject notice.",
    ]


def build_notice(payload: ConsumerRightsRequest, result: ConsumerRightsResponse) -> str:
    today = date.today().isoformat()
    consumer = payload.consumer_name or "[Your name]"
    address = payload.retailer_address or "[Retailer address]"
    order = payload.order_reference or "[Order / receipt number]"
    delivery = _delivery(payload).isoformat()
    proof = payload.proof_filename or "receipt and photographs of the fault"
    remedy = result.recommended_remedy.value.replace("_", " ")
    kind = payload.purchase_kind.value

    opening = (
        f"{today}\n\n"
        f"{payload.retailer_name}\n{address}\n\n"
        f"Dear Sir/Madam,\n\n"
        f"Re: Formal notice under the Consumer Rights Act 2015 — {payload.item_description} — {order}\n\n"
        f"I am {consumer}. I bought the {kind} described as \"{payload.item_description}\" from you "
        f"on {payload.purchase_date.isoformat()} for £{payload.purchase_price}. "
        f"Delivery / supply was on {delivery}.\n\n"
        f"The {kind} do not conform to the contract. The fault is: {payload.fault_description}\n\n"
        f"Evidence attached or available: {proof}.\n\n"
    )

    if result.pathway is RightsPathway.short_term_reject:
        body = (
            "Under sections 9 to 11 of the Consumer Rights Act 2015 the goods must be of satisfactory "
            "quality, fit for the particular purpose made known, and as described. They are not.\n\n"
            "I exercise my short-term right to reject under sections 20 and 22 of the Act "
            f"(this notice is given {result.days_since_delivery} days after delivery, within the 30-day period). "
            "I reject the goods and require a full refund of £"
            f"{payload.purchase_price} within 14 days of you receiving the goods back. "
            "Please arrange collection at your cost.\n"
        )
    elif result.pathway is RightsPathway.final_right_to_reject:
        body = (
            "I previously asked you to repair or replace the goods, or you refused a first remedy. "
            "Under section 23 that first remedy has not been provided in a reasonable time without "
            "significant inconvenience, or it has failed.\n\n"
            "I now exercise my final right to reject under section 24 of the Consumer Rights Act 2015 "
            f"and require a refund of £{payload.purchase_price}. "
            "If more than six months have passed you may only deduct a fair amount for use where the Act allows it.\n"
        )
    elif result.pathway is RightsPathway.price_reduction:
        body = (
            "A first repair or replacement was not provided or did not succeed. "
            "I elect a price reduction under section 24 of the Consumer Rights Act 2015. "
            "Please propose an appropriate reduction and refund that sum within 14 days.\n"
        )
    elif result.pathway is RightsPathway.burden_shift_guidance:
        body = (
            "More than six months have passed since delivery. I still rely on sections 9 to 11 and 19. "
            "I will provide evidence that the fault was present at delivery. "
            f"I require the following remedy: {remedy}. "
            "Please confirm your position within 14 days.\n"
        )
    else:
        body = (
            "The 30-day short-term right to reject has ended (or I have chosen not to reject). "
            "Under section 23 I require a repair or replacement at your cost, within a reasonable time "
            "and without significant inconvenience. I must not be charged for returning faulty goods.\n\n"
            f"The remedy I require is: {remedy}. Please confirm arrangements within 14 days. "
            "If you do not, I will exercise my final right to reject or claim a price reduction under section 24.\n"
        )

    closing = (
        "\nThis letter is a formal complaint and a notice of my statutory rights. "
        "It is not a waiver of any other remedy, including a chargeback or an ADR / court claim.\n\n"
        "Yours faithfully,\n"
        f"{consumer}\n"
    )
    return opening + body + closing


def evaluate_rights(payload: ConsumerRightsRequest, today: date | None = None) -> ConsumerRightsResponse:
    as_of = today or date.today()
    delivery = _delivery(payload)
    days = max((as_of - delivery).days, 0)
    pathway, remedy = classify_pathway(days, payload.prior_remedy, payload.desired_remedy)
    label, _window, _notes = _PATHWAYS[pathway]
    summary, guideline = _summary(pathway, remedy, days, payload.locale)
    response = ConsumerRightsResponse(
        pathway=pathway,
        pathway_label=label,
        recommended_remedy=remedy,
        days_since_delivery=days,
        within_30_days=days <= 30,
        within_6_months=days <= 180,
        burden_on_trader=days <= 180 and payload.purchase_kind is not PurchaseKind.services,
        statute_refs=_statute_refs(payload.purchase_kind, pathway),
        summary=summary,
        guideline=guideline,
        notice_draft="",
        next_steps=_next_steps(pathway, payload.locale),
        retailer_name=payload.retailer_name,
        item_description=payload.item_description,
        purchase_price=payload.purchase_price,
        order_reference=payload.order_reference,
        proof_filename=payload.proof_filename,
    )
    response.notice_draft = build_notice(payload, response)
    return response
