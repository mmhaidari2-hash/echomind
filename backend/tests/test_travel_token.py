"""Regression test for the travel confirm-token flake (CI run #60).

The old token format base64-encoded ``blob + b"." + raw_digest`` and split it
with ``rsplit(b".", 1)``. The raw 32-byte HMAC digest contains a 0x2E byte
~12% of the time, so a genuine token failed verification and confirm returned
403. This test quotes + confirms 500 times so the flake cannot hide.
"""

from app.services.travel import confirm_travel, verify_confirm_token, quote_travel


def test_confirm_token_never_flakes() -> None:
    for _ in range(500):
        quote = quote_travel("Book me a hotel in Paris tomorrow", "en")
        assert verify_confirm_token(quote.confirm_token, quote.intent_id)
        confirmed = confirm_travel(quote.intent_id, quote.confirm_token, "en")
        assert confirmed.status == "confirmed"
        assert confirmed.intent_id == quote.intent_id


def test_tampered_and_wrong_intent_tokens_rejected() -> None:
    quote = quote_travel("Book me a hotel in Paris tomorrow", "en")
    token = quote.confirm_token
    # Flip one character inside the digest half.
    head, digest = token.split(".")
    tampered = head + "." + ("A" if digest[0] != "A" else "B") + digest[1:]
    assert not verify_confirm_token(tampered, quote.intent_id)
    assert not verify_confirm_token(token, "wrong-intent-id")
    assert not verify_confirm_token("not-a-real-token", quote.intent_id)
    assert not verify_confirm_token("", quote.intent_id)
