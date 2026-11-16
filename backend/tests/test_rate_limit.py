from fastapi import HTTPException

from app.rate_limit import check_rate_limit


def test_rate_limiter_returns_429_after_verified_user_budget() -> None:
    check_rate_limit("user-a", limit=2, window_seconds=60)
    check_rate_limit("user-a", limit=2, window_seconds=60)

    try:
        check_rate_limit("user-a", limit=2, window_seconds=60)
    except HTTPException as exc:
        assert exc.status_code == 429
        assert exc.detail == "Too many requests"
        assert int(exc.headers["Retry-After"]) >= 1
    else:
        raise AssertionError("Expected rate limit to reject the third request")


def test_rate_limit_is_separate_per_user() -> None:
    check_rate_limit("user-a", limit=1, window_seconds=60)
    check_rate_limit("user-b", limit=1, window_seconds=60)
