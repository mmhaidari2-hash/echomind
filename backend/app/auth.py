from __future__ import annotations

from functools import lru_cache

import jwt
from fastapi import Header, HTTPException, status
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError

from app.config import settings
from app.rate_limit import check_rate_limit


class AuthenticationNotConfiguredError(RuntimeError):
    pass


def _jwks_url() -> str:
    explicit = settings.CLERK_JWKS_URL.strip()
    if explicit:
        return explicit
    issuer = settings.CLERK_ISSUER.strip().rstrip("/")
    if not issuer:
        raise AuthenticationNotConfiguredError("Authentication is not configured")
    return f"{issuer}/.well-known/jwks.json"


@lru_cache(maxsize=1)
def _jwk_client() -> PyJWKClient:
    return PyJWKClient(_jwks_url(), cache_keys=True)


def verify_clerk_token(token: str) -> str:
    issuer = settings.CLERK_ISSUER.strip().rstrip("/")
    if not issuer:
        raise AuthenticationNotConfiguredError("Authentication is not configured")
    try:
        signing_key = _jwk_client().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=issuer,
            options={"verify_aud": False, "require": ["exp", "iss", "sub"]},
        )
    except (InvalidTokenError, ValueError, RuntimeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
        ) from exc

    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication subject")

    allowed = settings.clerk_authorized_party_list()
    if allowed:
        azp = payload.get("azp")
        aud = payload.get("aud")
        audience = [aud] if isinstance(aud, str) else list(aud or [])
        if azp not in allowed and not any(item in allowed for item in audience):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication origin is not allowed")

    return subject.strip()


def require_user(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        user_id = verify_clerk_token(token)
        check_rate_limit(
            user_id,
            limit=settings.RATE_LIMIT_REQUESTS,
            window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
        )
        return user_id
    except AuthenticationNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
