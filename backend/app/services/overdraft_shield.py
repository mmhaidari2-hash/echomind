"""Overdraft Shield pathway engine and bank / FOS complaint drafts."""

from __future__ import annotations

from datetime import date

from app.schemas.overdraft_shield import (
    OverdraftKind,
    OverdraftShieldPathwayInfo,
    OverdraftShieldRequest,
    OverdraftShieldResponse,
    PriorComplaint,
    ShieldPathway,
)

FOS_URL = "https://www.financial-ombudsman.org.uk/consumers/how-to-complain"

_PATHWAYS: dict[ShieldPathway, tuple[str, str, str]] = {
    ShieldPathway.bank_complaint: (
        "First written complaint to the bank",
        "Before a final response, or within 8 weeks of complaining",
        "Ask the bank to explain the charge, refund it, and confirm how the overdraft was disclosed.",
    ),
    ShieldPathway.chase_final_response: (
        "Chase the bank's final response",
        "Formal complaint already lodged, under 8 weeks",
        "The bank has up to 8 weeks to issue a final response before you can refer the case to FOS.",
    ),
    ShieldPathway.fos_referral: (
        "Financial Ombudsman Service",
        "After a final response, a refusal, or 8 weeks with no resolution",
        "You usually have 6 months from the bank's final response to refer the complaint to FOS.",
    ),
    ShieldPathway.vulnerability_support: (
        "Fair treatment / financial difficulty",
        "Where you were struggling when the fee was taken",
        "Banks must treat customers in financial difficulty fairly and consider a goodwill refund.",
    ),
}


def list_pathways() -> list[OverdraftShieldPathwayInfo]:
    return [
        OverdraftShieldPathwayInfo(id=key, label=label, window=window, notes=notes)
        for key, (label, window, notes) in _PATHWAYS.items()
    ]


def classify_pathway(prior: PriorComplaint, struggling: bool) -> ShieldPathway:
    if prior in {PriorComplaint.bank_refused, PriorComplaint.eight_weeks}:
        return ShieldPathway.fos_referral
    if prior is PriorComplaint.formal_pending:
        return ShieldPathway.chase_final_response
    if struggling:
        return ShieldPathway.vulnerability_support
    return ShieldPathway.bank_complaint


def _statute_refs(kind: OverdraftKind, pathway: ShieldPathway) -> list[str]:
    refs = [
        "FCA Consumer Duty (PRIN 2A)",
        "FCA CONC 5D / 7 (overdrafts and arrears, forbearance)",
    ]
    if kind is OverdraftKind.unarranged:
        refs.append("Unarranged overdraft charges must be clear, fair and not excessive")
    else:
        refs.append("Arranged overdraft terms must be disclosed and suitable")
    if pathway is ShieldPathway.fos_referral:
        refs.append("FOS: 8-week rule and 6 months from a final response")
    if pathway is ShieldPathway.vulnerability_support:
        refs.append("FCA guidance on vulnerable customers and financial difficulty")
    return refs


def _summary(
    pathway: ShieldPathway,
    kind: OverdraftKind,
    days: int,
    locale: str,
) -> tuple[str, str]:
    label, _window, notes = _PATHWAYS[pathway]
    kind_en = "unarranged" if kind is OverdraftKind.unarranged else "arranged"
    kind_fa = "غیرترتیبی" if kind is OverdraftKind.unarranged else "ترتیبی"
    if locale == "fa":
        summaries = {
            ShieldPathway.bank_complaint: (
                f"{days} روز از کارمزد {kind_fa} گذشته. ابتدا شکایت کتبی به بانک بفرستید و بازپرداخت بخواهید."
            ),
            ShieldPathway.chase_final_response: (
                "شکایت رسمی ثبت شده. بانک تا ۸ هفته فرصت پاسخ نهایی دارد؛ تا آن زمان پرونده را نزد بانک پیگیری کنید."
            ),
            ShieldPathway.fos_referral: (
                "بانک رد کرده یا ۸ هفته گذشته. می‌توانید پرونده را به Financial Ombudsman Service ارجاع دهید."
            ),
            ShieldPathway.vulnerability_support: (
                f"کارمزد {kind_fa} در شرایط فشار مالی گرفته شده. از بانک بخواهید با شما منصفانه رفتار کند و کارمزد را برگرداند."
            ),
        }
        return summaries[pathway], notes
    summaries = {
        ShieldPathway.bank_complaint: (
            f"{days} days since the {kind_en} overdraft fee. Start with a written complaint to the bank "
            "asking for an explanation and a refund."
        ),
        ShieldPathway.chase_final_response: (
            "A formal complaint is already with the bank. It has up to 8 weeks to issue a final response."
        ),
        ShieldPathway.fos_referral: (
            "The bank has refused, or 8 weeks have passed without a final response. "
            "You can now refer the complaint to the Financial Ombudsman Service."
        ),
        ShieldPathway.vulnerability_support: (
            f"This {kind_en} fee was taken while you were under financial pressure. "
            "Ask the bank to treat you fairly and refund the charge as a goodwill or forbearance step."
        ),
    }
    return summaries[pathway], notes


def _next_steps(pathway: ShieldPathway, locale: str) -> list[str]:
    if locale == "fa":
        if pathway is ShieldPathway.fos_referral:
            return [
                "نامه یا پاسخ نهایی بانک را نگه دارید.",
                "از وب‌سایت FOS شکایت مصرف‌کننده ثبت کنید.",
                "معمولاً تا ۶ ماه پس از پاسخ نهایی بانک فرصت دارید.",
            ]
        if pathway is ShieldPathway.chase_final_response:
            return [
                "اگر ۸ هفته تمام شد و پاسخی نیامد، به FOS ارجاع دهید.",
                "صورتحساب و پیام‌های قبلی را یکجا نگه دارید.",
                "اگر در فشار مالی هستید، همان را صریح بنویسید.",
            ]
        if pathway is ShieldPathway.vulnerability_support:
            return [
                "نامه را بفرستید و فشار مالی را صریح ذکر کنید.",
                "از بانک بخواهید کارمزد را برگرداند و سقف اضافه برداشت را بازبینی کند.",
                "اگر نپذیرفت، پس از پاسخ نهایی یا ۸ هفته به FOS بروید.",
            ]
        return [
            "نامه شکایت را برای بانک بفرستید و مهلت ۱۴ روزه بگذارید.",
            "تاریخ، مبلغ و نوع اضافه برداشت را با صورتحساب ضمیمه کنید.",
            "اگر رد شد یا ۸ هفته گذشت، نامه ارجاع FOS تولید کنید.",
        ]
    if pathway is ShieldPathway.fos_referral:
        return [
            "Keep the bank's final response, or note that 8 weeks have passed with none.",
            "Submit a consumer complaint on the FOS website.",
            "You usually have 6 months from the bank's final response to refer the case.",
        ]
    if pathway is ShieldPathway.chase_final_response:
        return [
            "If 8 weeks pass with no final response, refer the case to FOS.",
            "Keep statements and earlier messages in one place.",
            "Say clearly if you were struggling financially when the fee was taken.",
        ]
    if pathway is ShieldPathway.vulnerability_support:
        return [
            "Send the letter and state the financial difficulty in plain language.",
            "Ask the bank to refund the fee and review the overdraft limit.",
            "If it refuses, generate a FOS referral after a final response or 8 weeks.",
        ]
    return [
        "Send the complaint and give the bank 14 days to reply.",
        "Attach the statement showing the fee date, amount, and overdraft type.",
        "If refused, or if 8 weeks pass, generate a FOS referral.",
    ]


def build_notice(payload: OverdraftShieldRequest, result: OverdraftShieldResponse) -> str:
    today = date.today().isoformat()
    customer = payload.customer_name or "[Your name]"
    address = payload.bank_address or "[Bank complaints address]"
    last4 = payload.account_last4 or "****"
    proof = payload.proof_filename or "account statement showing the fee"
    kind = payload.overdraft_kind.value
    account = payload.account_type.value

    opening = (
        f"{today}\n\n"
        f"{payload.bank_name}\n{address}\n\n"
        f"Dear Complaints Team,\n\n"
        f"Re: Formal complaint — {kind} overdraft fee of £{payload.fee_amount} "
        f"on {payload.fee_date.isoformat()} — account ending {last4}\n\n"
        f"I am {customer}. I hold a {account} account with you. "
        f"On {payload.fee_date.isoformat()} you charged me £{payload.fee_amount} "
        f"as an {kind} overdraft fee.\n\n"
        f"Why I dispute the charge: {payload.fee_description}\n\n"
        f"Evidence attached or available: {proof}.\n\n"
    )

    if result.pathway is ShieldPathway.fos_referral:
        body = (
            "I have already complained, or more than eight weeks have passed without a final response. "
            "I now require a written final response so I can refer this matter to the "
            "Financial Ombudsman Service, or I will refer it on the basis that eight weeks have elapsed.\n\n"
            f"Please confirm the complaint reference and send any final response immediately. "
            f"FOS contact details are at {FOS_URL}.\n"
        )
    elif result.pathway is ShieldPathway.chase_final_response:
        body = (
            "A formal complaint is already with you. Under the Financial Ombudsman Service rules "
            "you should issue a final response within eight weeks. Please send that response now, "
            "including a clear explanation of the charge and whether you will refund it.\n"
        )
    elif result.pathway is ShieldPathway.vulnerability_support:
        body = (
            "I was in financial difficulty when this fee was taken. Under the FCA Consumer Duty "
            "and CONC rules on forbearance and fair treatment of customers in difficulty, "
            "I ask you to refund £"
            f"{payload.fee_amount} as a goodwill or forbearance step, review the overdraft "
            "limit, and confirm what support is available.\n"
        )
    else:
        body = (
            "Please explain how this overdraft was arranged or disclosed, why the fee was applied, "
            f"and refund £{payload.fee_amount}. If the charge was unexpected, unclear, or not "
            "suitable for my circumstances, it should not stand.\n\n"
            "Please treat this as a formal complaint and reply within 14 days. "
            "If I do not receive a satisfactory final response within eight weeks I will refer "
            f"the case to the Financial Ombudsman Service ({FOS_URL}).\n"
        )

    closing = (
        "\nThis letter is a formal complaint. It is not a waiver of any other remedy, "
        "including a FOS referral.\n\n"
        "Yours faithfully,\n"
        f"{customer}\n"
    )
    return opening + body + closing


def evaluate_shield(
    payload: OverdraftShieldRequest,
    today: date | None = None,
) -> OverdraftShieldResponse:
    as_of = today or date.today()
    days = max((as_of - payload.fee_date).days, 0)
    pathway = classify_pathway(payload.prior_complaint, payload.struggling)
    label, _window, _notes = _PATHWAYS[pathway]
    summary, guideline = _summary(pathway, payload.overdraft_kind, days, payload.locale)
    response = OverdraftShieldResponse(
        pathway=pathway,
        pathway_label=label,
        days_since_fee=days,
        overdraft_kind=payload.overdraft_kind,
        can_refer_fos=pathway is ShieldPathway.fos_referral,
        fos_url=FOS_URL,
        statute_refs=_statute_refs(payload.overdraft_kind, pathway),
        summary=summary,
        guideline=guideline,
        notice_draft="",
        next_steps=_next_steps(pathway, payload.locale),
        bank_name=payload.bank_name,
        fee_amount=payload.fee_amount,
        proof_filename=payload.proof_filename,
    )
    response.notice_draft = build_notice(payload, response)
    return response
