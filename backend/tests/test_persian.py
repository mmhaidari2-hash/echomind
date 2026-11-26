"""Persian handling + intent layer tests."""

from datetime import date, timedelta

from app.services import intent as intent_service
from app.services.persian import detect_language, normalize_fa, parse_money_gbp, parse_relative_date


def test_normalize_arabic_letters_and_digits() -> None:
    assert normalize_fa("قطارم تاخير كرد ۵ روز ديگه") == "قطارم تاخیر کرد 5 روز دیگه"
    assert normalize_fa("كتاب") == "کتاب"
    assert normalize_fa("می‌خواهم") == "میخواهم"


def test_normalize_colloquial_forms() -> None:
    assert "می خواهم" in normalize_fa("میخوام برم")
    assert "می شود" in normalize_fa("میشه؟")


def test_detect_language_persian_english_and_mixed() -> None:
    assert detect_language("قطارم دیر کرد") == "fa"
    assert detect_language("my train was delayed") == "en"
    assert detect_language("قطارم delayed شد") == "fa"
    assert detect_language("Delay Repay قطار") == "en"


def test_parse_relative_dates_persian() -> None:
    today = date(2026, 11, 26)  # a Thursday
    assert parse_relative_date("امروز", today) == today
    assert parse_relative_date("فردا", today) == today + timedelta(days=1)
    assert parse_relative_date("پس‌فردا", today) == today + timedelta(days=2)
    assert parse_relative_date("۵ روز دیگه", today) == today + timedelta(days=5)
    assert parse_relative_date("شنبه", today) == date(2026, 11, 28)
    assert parse_relative_date("nothing here", today) is None


def test_parse_money_gbp() -> None:
    assert parse_money_gbp("£42.50") == 42.5
    assert parse_money_gbp("£1,200 در سال") == 1200.0
    assert parse_money_gbp("no money") is None


def test_intent_brief_in_persian_and_english() -> None:
    assert intent_service.understand("امروز چی دارم؟").intent == "brief"
    assert intent_service.understand("what do I have today?").intent == "brief"
    assert intent_service.understand("صبح بخیر، امروز چی دارم؟").intent == "brief"


def test_intent_obligation_add_with_date() -> None:
    today = date(2026, 11, 26)
    result = intent_service.understand("یادم بنداز فردا قبض برق رو پرداخت کنم", today=today)
    assert result.intent == "obligation_add"
    assert result.due_date == today + timedelta(days=1)
    assert "برق" in str(result.entities.get("title", ""))


def test_intent_delegate_parses_project_and_instruction() -> None:
    result = intent_service.understand("برو تو پروژه اکومایند آخرین کامیت رو چک کن")
    assert result.intent == "delegate"
    assert result.entities.get("project_name") == "اکومایند"
    assert "کامیت" in str(result.entities.get("instruction", ""))


def test_intent_delegate_in_english() -> None:
    result = intent_service.understand("in project EchoMind, check the latest commit")
    assert result.intent == "delegate"
    assert result.entities.get("project_name") == "EchoMind"


def test_intent_confirm_in_persian_and_english() -> None:
    assert intent_service.understand("تایید").intent == "confirm"
    assert intent_service.understand("تایید کن").intent == "confirm"
    assert intent_service.understand("confirm").intent == "confirm"


def test_intent_greeting_and_unknown() -> None:
    assert intent_service.understand("سلام").intent == "greeting"
    assert intent_service.understand("hello").intent == "greeting"
    unknown = intent_service.understand("what is the meaning of life?")
    assert unknown.intent == "unknown"
    assert unknown.confidence == "low"


def test_intent_mixed_language_promise_chase() -> None:
    result = intent_service.understand("قول British Gas رو پیگیری کن")
    assert result.intent == "promise_chase"
    assert result.language == "fa"


def test_intent_renewal_and_travel() -> None:
    assert intent_service.understand("تمدید بیمه ماشین کیه؟").intent == "renewal"
    assert intent_service.understand("سفرم به ادینبرو رو چک کن").intent == "travel"
