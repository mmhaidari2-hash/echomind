"""Proactive alerts for statutory deadlines and low-balance thresholds."""

from __future__ import annotations

import threading
import uuid
from datetime import date
from decimal import Decimal

from app.schemas.notifications import (
    Alert,
    AlertBundle,
    AlertSeverity,
    EvaluateRequest,
    Recommendation,
    WatchCreate,
    WatchKind,
    WatchRecord,
)

RIGHT_TO_REJECT_DAYS = 30
BURDEN_SHIFT_DAYS = 180
DELAY_REPAY_DAYS = 28
FOS_WAIT_DAYS = 56
FOS_REFER_DAYS = 180

_store: dict[str, dict[str, WatchRecord]] = {}
_lock = threading.Lock()


def _severity(days_remaining: int) -> AlertSeverity:
    if days_remaining <= 3:
        return AlertSeverity.urgent
    if days_remaining <= 7:
        return AlertSeverity.soon
    if days_remaining <= 14:
        return AlertSeverity.watch
    return AlertSeverity.info


def _copy(locale: str, en: str, fa: str) -> str:
    return fa if locale == "fa" else en


def add_watch(user_id: str, payload: WatchCreate) -> WatchRecord:
    record = WatchRecord(id=uuid.uuid4().hex[:12], **payload.model_dump())
    with _lock:
        _store.setdefault(user_id, {})[record.id] = record
    return record


def list_watches(user_id: str) -> list[WatchRecord]:
    with _lock:
        return list(_store.get(user_id, {}).values())


def delete_watch(user_id: str, watch_id: str) -> bool:
    with _lock:
        return _store.get(user_id, {}).pop(watch_id, None) is not None


def reset_store() -> None:
    with _lock:
        _store.clear()


def _purchase_alerts(watch: WatchRecord, today: date, locale: str) -> list[Alert]:
    if not watch.anchor_date:
        return []
    elapsed = (today - watch.anchor_date).days
    remaining_30 = RIGHT_TO_REJECT_DAYS - elapsed
    remaining_180 = BURDEN_SHIFT_DAYS - elapsed
    alerts: list[Alert] = []
    if 0 <= remaining_30 <= 14:
        alerts.append(
            Alert(
                id=f"{watch.id}-reject",
                watch_id=watch.id,
                kind=WatchKind.purchase,
                severity=_severity(remaining_30),
                title=_copy(locale, "30-day right to reject", "حق رد ۳۰روزه"),
                message=_copy(
                    locale,
                    f"{watch.title}: {remaining_30} day(s) left to reject and claim a full refund.",
                    f"{watch.title}: {remaining_30} روز تا پایان حق رد و بازپرداخت کامل باقی است.",
                ),
                days_remaining=remaining_30,
                action_pillar="consumer_rights",
                action_label=_copy(locale, "Open Consumer Rights", "باز کردن حقوق مصرف‌کننده"),
            )
        )
    elif remaining_30 < 0 and 0 <= remaining_180 <= 21:
        alerts.append(
            Alert(
                id=f"{watch.id}-burden",
                watch_id=watch.id,
                kind=WatchKind.purchase,
                severity=_severity(remaining_180),
                title=_copy(locale, "6-month burden shift", "تغییر بار اثبات ۶ماهه"),
                message=_copy(
                    locale,
                    f"{watch.title}: {remaining_180} day(s) until you usually have to prove the fault was there at delivery.",
                    f"{watch.title}: {remaining_180} روز تا قاعده ۶ماهه اثبات باقی است.",
                ),
                days_remaining=remaining_180,
                action_pillar="consumer_rights",
                action_label=_copy(locale, "Open Consumer Rights", "باز کردن حقوق مصرف‌کننده"),
            )
        )
    return alerts


def _delay_alerts(watch: WatchRecord, today: date, locale: str) -> list[Alert]:
    if not watch.anchor_date:
        return []
    remaining = DELAY_REPAY_DAYS - (today - watch.anchor_date).days
    if remaining < 0 or remaining > 14:
        return []
    return [
        Alert(
            id=f"{watch.id}-delay",
            watch_id=watch.id,
            kind=WatchKind.delay_repay,
            severity=_severity(remaining),
            title=_copy(locale, "Delay Repay deadline", "مهلت Delay Repay"),
            message=_copy(
                locale,
                f"{watch.title}: {remaining} day(s) left to claim (usually 28 days).",
                f"{watch.title}: {remaining} روز برای ثبت ادعا باقی است (معمولاً ۲۸ روز).",
            ),
            days_remaining=remaining,
            action_pillar="delay_repay",
            action_label=_copy(locale, "Open Delay Repay", "باز کردن Delay Repay"),
        )
    ]


def _overdraft_alerts(watch: WatchRecord, today: date, locale: str) -> list[Alert]:
    if not watch.anchor_date:
        return []
    elapsed = (today - watch.anchor_date).days
    remaining_fos = FOS_WAIT_DAYS - elapsed
    alerts: list[Alert] = []
    if 0 <= remaining_fos <= 14:
        alerts.append(
            Alert(
                id=f"{watch.id}-fos-wait",
                watch_id=watch.id,
                kind=WatchKind.overdraft,
                severity=_severity(remaining_fos),
                title=_copy(locale, "Bank 8-week response", "پاسخ ۸هفته‌ای بانک"),
                message=_copy(
                    locale,
                    f"{watch.title}: {remaining_fos} day(s) until you can refer the case to FOS if there is no final response.",
                    f"{watch.title}: {remaining_fos} روز تا امکان ارجاع به FOS در صورت نبود پاسخ نهایی.",
                ),
                days_remaining=remaining_fos,
                action_pillar="overdraft_shield",
                action_label=_copy(locale, "Open Overdraft Shield", "باز کردن سپر اضافه برداشت"),
            )
        )
    remaining_refer = FOS_REFER_DAYS - elapsed
    if remaining_fos < 0 and 0 <= remaining_refer <= 21:
        alerts.append(
            Alert(
                id=f"{watch.id}-fos-refer",
                watch_id=watch.id,
                kind=WatchKind.overdraft,
                severity=_severity(remaining_refer),
                title=_copy(locale, "FOS referral window", "مهلت ارجاع FOS"),
                message=_copy(
                    locale,
                    f"{watch.title}: {remaining_refer} day(s) left to refer a final response to the Financial Ombudsman.",
                    f"{watch.title}: {remaining_refer} روز برای ارجاع پاسخ نهایی به FOS باقی است.",
                ),
                days_remaining=remaining_refer,
                action_pillar="overdraft_shield",
                action_label=_copy(locale, "Open Overdraft Shield", "باز کردن سپر اضافه برداشت"),
            )
        )
    return alerts


def _balance_alerts(watch: WatchRecord, locale: str) -> list[Alert]:
    if watch.amount is None or watch.threshold is None:
        return []
    if watch.amount >= watch.threshold:
        return []
    shortfall = watch.threshold - watch.amount
    return [
        Alert(
            id=f"{watch.id}-balance",
            watch_id=watch.id,
            kind=WatchKind.balance,
            severity=AlertSeverity.urgent if shortfall >= watch.threshold else AlertSeverity.soon,
            title=_copy(locale, "Low balance", "موجودی کم"),
            message=_copy(
                locale,
                f"{watch.title}: £{watch.amount} is under your £{watch.threshold} threshold (short by £{shortfall}).",
                f"{watch.title}: £{watch.amount} زیر آستانه £{watch.threshold} است (کسری £{shortfall}).",
            ),
            days_remaining=None,
            action_pillar="overdraft_shield",
            action_label=_copy(locale, "Open Overdraft Shield", "باز کردن سپر اضافه برداشت"),
        )
    ]


def evaluate_watch(watch: WatchRecord, today: date | None = None) -> list[Alert]:
    as_of = today or date.today()
    if watch.kind is WatchKind.purchase:
        return _purchase_alerts(watch, as_of, watch.locale)
    if watch.kind is WatchKind.delay_repay:
        return _delay_alerts(watch, as_of, watch.locale)
    if watch.kind is WatchKind.overdraft:
        return _overdraft_alerts(watch, as_of, watch.locale)
    return _balance_alerts(watch, watch.locale)


def _recommendations(alerts: list[Alert], watches: list[WatchRecord], locale: str) -> list[Recommendation]:
    recs: list[Recommendation] = []
    seen: set[str] = set()
    for alert in sorted(alerts, key=lambda item: (item.severity.value, item.days_remaining or 99)):
        if not alert.action_pillar or alert.action_pillar in seen:
            continue
        seen.add(alert.action_pillar)
        recs.append(
            Recommendation(
                id=f"rec-{alert.id}",
                title=alert.title,
                reason=alert.message,
                action_pillar=alert.action_pillar,
                action_label=alert.action_label or alert.title,
                priority=0 if alert.severity is AlertSeverity.urgent else 1,
            )
        )
    kinds = {item.kind for item in watches}
    if WatchKind.purchase not in kinds:
        recs.append(
            Recommendation(
                id="rec-scan-receipt",
                title=_copy(locale, "Scan a receipt", "اسکن رسید"),
                reason=_copy(
                    locale,
                    "Photograph a receipt so EchoMind can track the 30-day right to reject.",
                    "از رسید عکس بگیرید تا حق رد ۳۰روزه را پیگیری کنیم.",
                ),
                action_pillar="consumer_rights",
                action_label=_copy(locale, "Upload document", "بارگذاری سند"),
                priority=2,
            )
        )
    if WatchKind.delay_repay not in kinds:
        recs.append(
            Recommendation(
                id="rec-scan-ticket",
                title=_copy(locale, "Scan a delayed ticket", "اسکن بلیت تأخیری"),
                reason=_copy(
                    locale,
                    "Upload a train ticket to auto-fill Delay Repay before the 28-day window closes.",
                    "بلیت قطار را بارگذاری کنید تا Delay Repay قبل از پایان ۲۸ روز پر شود.",
                ),
                action_pillar="delay_repay",
                action_label=_copy(locale, "Upload ticket", "بارگذاری بلیت"),
                priority=2,
            )
        )
    return recs[:4]


def evaluate_bundle(
    watches: list[WatchCreate] | list[WatchRecord],
    *,
    locale: str = "en",
    today: date | None = None,
    balance: Decimal | None = None,
    balance_threshold: Decimal | None = None,
) -> AlertBundle:
    records: list[WatchRecord] = []
    for item in watches:
        if isinstance(item, WatchRecord):
            records.append(item)
        else:
            records.append(WatchRecord(id=uuid.uuid4().hex[:12], **item.model_dump()))
    if balance is not None and balance_threshold is not None:
        records.append(
            WatchRecord(
                id="balance-live",
                kind=WatchKind.balance,
                title=_copy(locale, "Available balance", "موجودی در دسترس"),
                amount=balance,
                threshold=balance_threshold,
                locale=locale,
            )
        )
    alerts: list[Alert] = []
    for record in records:
        if not record.locale:
            record.locale = locale
        alerts.extend(evaluate_watch(record, today))
    alerts.sort(
        key=lambda item: (
            {"urgent": 0, "soon": 1, "watch": 2, "info": 3}[item.severity.value],
            item.days_remaining if item.days_remaining is not None else 99,
        )
    )
    return AlertBundle(
        alerts=alerts,
        recommendations=_recommendations(alerts, records, locale),
        tracked=len(records),
    )


def evaluate_request(payload: EvaluateRequest, today: date | None = None) -> AlertBundle:
    return evaluate_bundle(
        payload.watches,
        locale=payload.locale,
        today=today,
        balance=payload.balance,
        balance_threshold=payload.balance_threshold,
    )


def stored_bundle(user_id: str, locale: str = "en") -> AlertBundle:
    return evaluate_bundle(list_watches(user_id), locale=locale)
