"""Bank endpoints — UK Open Banking via TrueLayer. READ-ONLY.

There is intentionally no payment route in this module. Moving money
needs a separate, explicitly confirmed flow that is not built here; the
test suite asserts that /connectors/bank/payments does not exist.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse

from app.auth import require_user
from app.schemas.connectors import (
    BankAccount,
    BankConnectStart,
    BankConnectorStatus,
    BankTransaction,
)
from app.services.truelayer_connector import (
    ConnectorNotConfiguredError,
    ConnectorNotConnectedError,
    ConnectorPermissionError,
    ConnectorUpstreamError,
    accounts as read_accounts,
    begin,
    complete,
    disconnect,
    status,
    transactions as read_transactions,
)

router = APIRouter(prefix="/connectors/bank", tags=["connectors"])


def _raise_connector(exc: Exception) -> None:
    if isinstance(exc, ConnectorNotConfiguredError):
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if isinstance(exc, ConnectorNotConnectedError):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if isinstance(exc, ConnectorPermissionError):
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if isinstance(exc, ConnectorUpstreamError):
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    raise exc


@router.get("/status", response_model=BankConnectorStatus)
def bank_status(user_id: str = Depends(require_user)) -> BankConnectorStatus:
    return BankConnectorStatus(**status(user_id))


@router.post("/start", response_model=BankConnectStart)
def start(user_id: str = Depends(require_user)) -> BankConnectStart:
    try:
        return BankConnectStart(authorization_url=begin(user_id))
    except Exception as exc:
        _raise_connector(exc)
        raise


@router.get("/callback", response_class=HTMLResponse)
def callback(state: str, code: str) -> HTMLResponse:
    try:
        complete(state, code)
    except Exception as exc:
        _raise_connector(exc)
        raise
    html = """<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EchoMind connected</title></head>
<body style="font-family:system-ui;background:#090d16;color:#e2e8f0;padding:32px">
  <main style="max-width:520px;margin:auto">
    <h1>Bank connected</h1>
    <p>EchoMind can now read your accounts. It cannot move money.</p>
    <p>You can return to EchoMind now.</p>
    <a href="echomind://oauth/bank?connected=1" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#7dd3fc;color:#07111f;text-decoration:none;font-weight:700">Return to EchoMind</a>
  </main>
</body>
</html>"""
    return HTMLResponse(content=html, status_code=200)


@router.get("/accounts", response_model=list[BankAccount])
def bank_accounts(user_id: str = Depends(require_user)) -> list[BankAccount]:
    try:
        return read_accounts(user_id)
    except Exception as exc:
        _raise_connector(exc)
        raise


@router.get("/accounts/{account_id}/transactions", response_model=list[BankTransaction])
def bank_transactions(
    account_id: str,
    limit: int = Query(default=20, ge=1, le=50),
    user_id: str = Depends(require_user),
) -> list[BankTransaction]:
    try:
        return read_transactions(user_id, account_id, limit)
    except Exception as exc:
        _raise_connector(exc)
        raise


@router.delete("")
def remove_connection(user_id: str = Depends(require_user)) -> dict[str, bool]:
    disconnect(user_id)
    return {"disconnected": True}
