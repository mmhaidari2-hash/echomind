"""Mail search, archive scan, snooze, unanswered chase, in-thread reply."""

import base64
import json
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.auth import require_user
from app.main import app
from app.services import google_connector, mail as mail_service

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolate_mail(tmp_path):
    mail_service.use_store_path(tmp_path / "snoozes.json")
    yield


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


def _detail(message_id: str, subject: str, sender: str, date_str: str, snippet: str = "") -> dict:
    return {
        "id": message_id,
        "threadId": f"thread-{message_id}",
        "snippet": snippet,
        "payload": {
            "headers": [
                {"name": "Subject", "value": subject},
                {"name": "From", "value": sender},
                {"name": "Date", "value": date_str},
                {"name": "Message-ID", "value": f"<{message_id}@example.test>"},
            ]
        },
    }


class _GmailFake:
    """Stubs google_connector._api_json by URL."""

    def __init__(self):
        self.sent: list[dict] = []
        self.messages: dict[str, dict] = {}
        self.threads: dict[str, dict] = {}
        self.profile = {"emailAddress": "me@example.test"}

    def api_json(self, user_id, method, url, *, required_scope=None, body=None):
        if "/users/me/profile" in url:
            return dict(self.profile)
        if method == "POST" and "/messages/send" in url:
            self.sent.append(body or {})
            return {"id": "sent-1", "threadId": (body or {}).get("threadId", "t1")}
        if "/users/me/threads/" in url:
            thread_id = url.split("/threads/")[1].split("?")[0]
            return self.threads.get(thread_id, {"messages": []})
        if "/users/me/messages/" in url and "?" in url:
            message_id = url.split("/messages/")[1].split("?")[0]
            if message_id not in self.messages:
                raise google_connector.ConnectorUpstreamError("Google API request failed (404)")
            return self.messages[message_id]
        if "/users/me/messages" in url:
            return {"messages": [{"id": mid} for mid in self.messages]}
        raise AssertionError(f"unexpected Gmail call {method} {url}")


def _seed_gmail(monkeypatch, fake: _GmailFake) -> None:
    monkeypatch.setattr(google_connector, "_api_json", fake.api_json)


def test_search_returns_archive_matches(monkeypatch) -> None:
    fake = _GmailFake()
    fake.messages = {
        "m1": _detail("m1", "Your Avanti refund", "Avanti <noreply@avanti.test>", "Mon, 20 Nov 2026 10:00:00 +0000", "refund issued"),
    }
    _seed_gmail(monkeypatch, fake)
    _as("user-a")
    response = client.get("/api/v1/life/mail/search", params={"q": "Avanti refund"})
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["subject"] == "Your Avanti refund"
    assert rows[0]["message_id_header"] == "<m1@example.test>"


def test_search_fails_truthfully_when_google_not_connected() -> None:
    _as("user-a")
    # No _api_json stub and no token seeded: the connector raises.
    response = client.get("/api/v1/life/mail/search", params={"q": "refund"})
    assert response.status_code == 409


def test_archive_scan_runs_detectors_over_old_mail(monkeypatch) -> None:
    fake = _GmailFake()
    fake.messages = {
        "m1": _detail(
            "m1",
            "Your train was delayed",
            "Avanti West Coast <noreply@avanti.test>",
            "Mon, 20 Nov 2023 10:00:00 +0000",
            "Your Avanti service on 20 November 2023 was delayed by 45 minutes.",
        ),
    }
    _seed_gmail(monkeypatch, fake)
    _as("user-a")
    response = client.post("/api/v1/life/mail/scan-archive", json={"query": "delayed", "limit": 10})
    assert response.status_code == 200
    body = response.json()
    assert body["scanned"] == 1
    assert any(p["kind"] == "delay_repay" for p in body["proposals"])


def test_snooze_creates_obligation_and_cancel_removes_it(monkeypatch) -> None:
    fake = _GmailFake()
    fake.messages = {
        "m1": _detail("m1", "Council tax bill", "Council <billing@council.test>", "Mon, 23 Nov 2026 09:00:00 +0000"),
    }
    _seed_gmail(monkeypatch, fake)
    _as("user-a")
    until = (date.today() + timedelta(days=3)).isoformat()
    response = client.post("/api/v1/life/mail/snooze", json={"message_id": "m1", "snooze_until": until})
    assert response.status_code == 200
    snooze = response.json()
    assert snooze["status"] == "active"
    assert snooze["obligation_id"]
    obligations = client.get("/api/v1/life/obligations").json()
    assert any(item["id"] == snooze["obligation_id"] for item in obligations)
    assert any("Council tax bill" in item["title"] for item in obligations)

    listed = client.get("/api/v1/life/mail/snoozes").json()
    assert len(listed) == 1
    cancelled = client.post(f"/api/v1/life/mail/snoozes/{snooze['id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    obligations = client.get("/api/v1/life/obligations", params={"include_closed": True}).json()
    mine = [item for item in obligations if item["id"] == snooze["obligation_id"]]
    assert mine and mine[0]["status"] == "cancelled"


def test_snooze_unknown_message_is_502(monkeypatch) -> None:
    fake = _GmailFake()
    _seed_gmail(monkeypatch, fake)
    _as("user-a")
    response = client.post(
        "/api/v1/life/mail/snooze",
        json={"message_id": "nope", "snooze_until": date.today().isoformat()},
    )
    assert response.status_code == 502


def test_unanswered_finds_sent_mail_with_no_reply(monkeypatch) -> None:
    fake = _GmailFake()
    sent_date = (date.today() - timedelta(days=5)).strftime("%a, %d %b %Y 10:00:00 +0000")
    fake.messages = {
        "m1": _detail("m1", "Quote for the kitchen", "Me <me@example.test>", sent_date),
    }
    fake.threads = {
        "thread-m1": {
            "messages": [
                {
                    "id": "m1",
                    "snippet": "quote please",
                    "payload": {
                        "headers": [
                            {"name": "From", "value": "Me <me@example.test>"},
                            {"name": "To", "value": "Kitchen Co <hello@kitchen.test>"},
                            {"name": "Date", "value": sent_date},
                        ]
                    },
                }
            ]
        }
    }
    _seed_gmail(monkeypatch, fake)
    _as("user-a")
    response = client.get("/api/v1/life/mail/unanswered", params={"days": 3})
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["days_waiting"] >= 5
    assert "Kitchen Co" in rows[0]["recipient"]
    assert "Quote for the kitchen" in rows[0]["draft_subject"]


def test_unanswered_ignores_replied_threads(monkeypatch) -> None:
    fake = _GmailFake()
    sent_date = (date.today() - timedelta(days=5)).strftime("%a, %d %b %Y 10:00:00 +0000")
    reply_date = (date.today() - timedelta(days=4)).strftime("%a, %d %b %Y 10:00:00 +0000")
    fake.messages = {
        "m1": _detail("m1", "Quote for the kitchen", "Me <me@example.test>", sent_date),
    }
    fake.threads = {
        "thread-m1": {
            "messages": [
                {
                    "id": "m1",
                    "snippet": "quote please",
                    "payload": {
                        "headers": [
                            {"name": "From", "value": "Me <me@example.test>"},
                            {"name": "To", "value": "Kitchen Co <hello@kitchen.test>"},
                            {"name": "Date", "value": sent_date},
                        ]
                    },
                },
                {
                    "id": "m2",
                    "snippet": "here is your quote",
                    "payload": {
                        "headers": [
                            {"name": "From", "value": "Kitchen Co <hello@kitchen.test>"},
                            {"name": "To", "value": "Me <me@example.test>"},
                            {"name": "Date", "value": reply_date},
                        ]
                    },
                },
            ]
        }
    }
    _seed_gmail(monkeypatch, fake)
    _as("user-a")
    response = client.get("/api/v1/life/mail/unanswered", params={"days": 3})
    assert response.status_code == 200
    assert response.json() == []


def test_reply_stays_in_the_same_thread(monkeypatch) -> None:
    fake = _GmailFake()
    fake.messages = {
        "m1": _detail("m1", "Your refund", "Shop <help@shop.test>", "Mon, 23 Nov 2026 09:00:00 +0000"),
    }
    _seed_gmail(monkeypatch, fake)
    _as("user-a")
    response = client.post("/api/v1/life/mail/m1/reply", json={"body": "Where is my refund?"})
    assert response.status_code == 200
    assert len(fake.sent) == 1
    sent = fake.sent[0]
    assert sent["threadId"] == "thread-m1"
    raw = base64.urlsafe_b64decode(sent["raw"] + "==").decode("utf-8")
    assert "In-Reply-To: <m1@example.test>" in raw
    assert "Subject: Re: Your refund" in raw


def test_reply_needs_a_body() -> None:
    _as("user-a")
    response = client.post("/api/v1/life/mail/m1/reply", json={"body": "  "})
    assert response.status_code == 400
