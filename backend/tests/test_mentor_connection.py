"""EchoMind → command hub: submit via the hub dashboard form,
status from the hub's own pages, session stored encrypted.

The slot is GENERIC and pluggable: for Mahdi it is MENTOR; for
anyone else it stays empty until they plug in whatever hub they
like. MENTOR is the reference hub (production app
https://mentor-web-production-096b.up.railway.app).

Ground truth (repo read 2026-11-26, signed in as
mmhaidari2-hash; Mahdi's phone screenshots of the live app):
MENTOR's production app is
https://mentor-web-production-096b.up.railway.app. There is NO
public JSON task API and NO MCP server. Delegation is the
owner-only dashboard form POST /app/agents (repo, instruction,
engine) → 302 to /app/agents/{id}; 409 when a task is already
active for the repo; results as a GitHub PR/branch, owner
confirms. Status comes from /app/agents/{id}/check (fallback
/app/tasks/{id}) and the worker state from /app/agents — all
HTML pages, so states are matched from page text and reported
as "unknown" when nothing recognisable shows. POST
/api/bridge/claim and /api/bridge/tasks/.../result are OUTBOUND
(MENTOR delegating out to Codex) and are never called here.

No test below touches the live MENTOR app: every HTTP call is
stubbed. A live call has not run yet.
"""

import io
from http.client import HTTPMessage
from urllib.error import HTTPError

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.auth import require_user
from app.config import settings
from app.main import app
from app.schemas.projects import ProjectCreate, TaskCreate
from app.services import delegation as delegation_service
from app.services import mentor as mentor_service
from app.services.mentor import MentorNotReadyError, MentorUpstreamError
from app.services.projects import create_project

client = TestClient(app)

BASE = "https://mentor-web-production-096b.up.railway.app"


def _as(user_id: str) -> None:
    app.dependency_overrides[require_user] = lambda: user_id


@pytest.fixture(autouse=True)
def _key(monkeypatch):
    monkeypatch.setattr(settings, "CONNECTOR_TOKEN_KEY", Fernet.generate_key().decode())


class _FakeResponse:
    def __init__(self, status: int = 200, headers=None, body: bytes = b""):
        self.status = status
        self.headers = headers or {}
        self._body = body

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def _headers(**pairs):
    message = HTTPMessage()
    for key, value in pairs.items():
        message[key] = value
    return message


class _MentorFake:
    """Stands in for MENTOR's dashboard. Records every call."""

    def __init__(self, *, agents_page: bytes = b"<html><body>New task</body></html>", submit: str = "redirect"):
        self.calls: list[tuple[str, str, bytes | None]] = []
        self.agents_page = agents_page
        self.submit = submit

    def __call__(self, request, timeout=None):
        method = request.get_method()
        url = request.full_url
        data = request.data
        self.calls.append((method, url, data))
        if method == "POST" and url.endswith("/app/agents"):
            if self.submit == "redirect":
                raise HTTPError(
                    url, 302, "Found", _headers(Location="/app/agents/abc123"), io.BytesIO(b"")
                )
            if self.submit == "busy":
                raise HTTPError(url, 409, "Conflict", _headers(), io.BytesIO(b""))
            if self.submit == "expired":
                raise HTTPError(url, 401, "Unauthorized", _headers(), io.BytesIO(b""))
            if self.submit == "ok200":
                return _FakeResponse(200, {}, b"<html><body>New task</body></html>")
            raise AssertionError(f"unexpected submit mode {self.submit}")
        if method == "GET" and url.endswith("/app/agents"):
            return _FakeResponse(200, {}, self.agents_page)
        if method == "GET" and url.endswith("/app/tasks"):
            return _FakeResponse(200, {}, self.agents_page)
        raise AssertionError(f"unexpected MENTOR call {method} {url}")


def _sign_in(user_id: str, opener, cookie: str = "sess-123", endpoint: str = BASE) -> None:
    # The tests plug MENTOR in as the hub; the slot itself starts empty.
    mentor_service.set_connection(user_id, endpoint=endpoint, session_cookie=cookie, _urlopen=opener)


def test_slot_starts_empty_until_a_hub_is_plugged_in() -> None:
    connection = mentor_service.get_connection("user-a")
    assert connection.endpoint == ""
    assert connection.has_session is False
    assert connection.worker_state == "empty"
    assert connection.session_valid is None
    assert connection.paused is None
    assert "MENTOR" in (connection.detail or "")


def test_session_is_encrypted_and_never_returned() -> None:
    opener = _MentorFake()
    _sign_in("user-a", opener)
    connection = mentor_service.get_connection("user-a", _urlopen=opener)
    assert connection.has_session is True
    assert connection.session_valid is True
    assert connection.paused is False
    assert connection.worker_state == "ready"
    assert "sess-123" not in connection.model_dump_json()


def test_session_cookie_can_be_cleared() -> None:
    opener = _MentorFake()
    _sign_in("user-a", opener)
    cleared = mentor_service.clear_connection("user-a", _urlopen=opener)
    assert cleared.has_session is False
    assert cleared.worker_state == "needs-sign-in"


def test_submit_without_a_hub_fails_closed() -> None:
    with pytest.raises(MentorNotReadyError, match="No command hub is connected"):
        mentor_service.submit_task("user-a", "mmhaidari2-hash/atnex-app", "do the thing")


def test_submit_without_session_fails_closed() -> None:
    mentor_service.set_connection("user-a", endpoint=BASE)
    with pytest.raises(MentorNotReadyError, match="sign-in is missing"):
        mentor_service.submit_task("user-a", "mmhaidari2-hash/atnex-app", "do the thing")


def test_submit_without_repo_fails_closed() -> None:
    opener = _MentorFake()
    _sign_in("user-a", opener)
    with pytest.raises(MentorNotReadyError, match="No repo"):
        mentor_service.submit_task("user-a", "", "do the thing", _urlopen=opener)


def test_submit_posts_the_dashboard_form_and_reads_the_redirect() -> None:
    opener = _MentorFake()
    _sign_in("user-a", opener)
    result = mentor_service.submit_task(
        "user-a", "mmhaidari2-hash/atnex-app", "fix the login", "auto", _urlopen=opener
    )
    assert result.task_id == "abc123"
    assert result.task_url == f"{BASE}/app/agents/abc123"
    assert result.paused is False
    # calls[0] is the sign-in probe GET; the submit is the POST.
    method, url, data = next(c for c in opener.calls if c[0] == "POST")
    assert method == "POST"
    assert url == f"{BASE}/app/agents"
    assert b"repo=mmhaidari2-hash%2Fatnex-app" in data
    assert b"instruction=fix+the+login" in data
    assert b"engine=auto" in data


def test_submit_reports_paused_workers_instead_of_pretending() -> None:
    opener = _MentorFake(agents_page=b"<html><body>Agents paused. Task execution is paused in this app.</body></html>")
    _sign_in("user-a", opener)
    result = mentor_service.submit_task(
        "user-a", "mmhaidari2-hash/atnex-app", "fix the login", _urlopen=opener
    )
    assert result.paused is True


def test_submit_busy_repo_is_needs_owner_not_a_failure() -> None:
    opener = _MentorFake(submit="busy")
    _sign_in("user-a", opener)
    with pytest.raises(MentorNotReadyError, match="already has an active task"):
        mentor_service.submit_task("user-a", "mmhaidari2-hash/atnex-app", "fix it", _urlopen=opener)


def test_submit_expired_session_says_so() -> None:
    opener = _MentorFake(submit="expired")
    _sign_in("user-a", opener)
    with pytest.raises(MentorNotReadyError, match="rejected the stored session"):
        mentor_service.submit_task("user-a", "mmhaidari2-hash/atnex-app", "fix it", _urlopen=opener)


def test_submit_200_without_redirect_is_not_claimed() -> None:
    opener = _MentorFake(submit="ok200")
    _sign_in("user-a", opener)
    with pytest.raises(MentorUpstreamError, match="did not create the task"):
        mentor_service.submit_task("user-a", "mmhaidari2-hash/atnex-app", "fix it", _urlopen=opener)


def test_unknown_engine_falls_back_to_auto() -> None:
    opener = _MentorFake()
    _sign_in("user-a", opener)
    mentor_service.submit_task(
        "user-a", "mmhaidari2-hash/atnex-app", "fix it", "not-a-real-engine", _urlopen=opener
    )
    _method, _url, data = next(c for c in opener.calls if c[0] == "POST")
    assert b"engine=auto" in data


def test_worker_state_detects_paused_and_login_redirect() -> None:
    paused_opener = _MentorFake(
        agents_page=b"<html><body>Agents paused. New instructions stay queued until a worker is enabled.</body></html>"
    )
    _sign_in("user-a", paused_opener)
    valid, paused = mentor_service.worker_state("user-a", _urlopen=paused_opener)
    assert valid is True
    assert paused is True

    class _LoginRedirect(_MentorFake):
        def __call__(self, request, timeout=None):
            if request.get_method() == "GET":
                raise HTTPError(request.full_url, 302, "Found", _headers(Location="/login"), io.BytesIO(b""))
            return super().__call__(request, timeout)

    redirect_opener = _LoginRedirect()
    _sign_in("user-b", redirect_opener)
    valid, paused = mentor_service.worker_state("user-b", _urlopen=redirect_opener)
    assert valid is False
    assert paused is None


def test_check_task_status_maps_page_text_honestly() -> None:
    cases = [
        (b"<html><body>4 ready to merge</body></html>", "ready-to-merge"),
        (b"<html><body>Waiting for your decision</body></html>", "waiting-for-you"),
        (b"<html><body>1 finished</body></html>", "finished"),
        (b"<html><body>Agents paused. Task is queued.</body></html>", "queued"),
        (b"<html><body>0 tasks moving</body></html>", "running"),
        (b"<html><body>Something else entirely</body></html>", "unknown"),
    ]
    for index, (page, expected) in enumerate(cases):
        user_id = f"user-{index}"

        class _CheckFake(_MentorFake):
            def __call__(self, request, timeout=None):
                if "/check" in request.full_url:
                    return _FakeResponse(200, {}, page)
                return super().__call__(request, timeout)

        opener = _CheckFake()
        _sign_in(user_id, opener)
        status = mentor_service.check_task_status(user_id, "abc123", _urlopen=opener)
        assert status.state == expected, (page, status.state)
        assert status.task_id == "abc123"
        assert status.url == f"{BASE}/app/agents/abc123"


def test_check_task_status_unknown_when_mentor_has_no_such_task() -> None:
    class _MissingFake(_MentorFake):
        def __call__(self, request, timeout=None):
            if "/check" in request.full_url or "/app/tasks/" in request.full_url:
                return _FakeResponse(404, {}, b"not found")
            return super().__call__(request, timeout)

    opener = _MissingFake()
    _sign_in("user-a", opener)
    status = mentor_service.check_task_status("user-a", "nope", _urlopen=opener)
    assert status.state == "unknown"
    assert "no task with this id" in (status.detail or "")


def test_check_task_status_without_session_fails_closed() -> None:
    mentor_service.set_connection("user-a", endpoint=BASE)
    with pytest.raises(MentorNotReadyError, match="sign-in is missing"):
        mentor_service.check_task_status("user-a", "abc123")


def test_any_hub_endpoint_can_be_plugged_in() -> None:
    # The slot is not MENTOR-only: any hub speaking the same form
    # works. This one lives somewhere else entirely.
    other = "https://hub.example.test"
    opener = _MentorFake()
    _sign_in("user-a", opener, endpoint=other)
    result = mentor_service.submit_task(
        "user-a", "mmhaidari2-hash/atnex-app", "fix the login", _urlopen=opener
    )
    assert result.task_url == f"{other}/app/agents/abc123"
    method, url, _data = next(c for c in opener.calls if c[0] == "POST")
    assert method == "POST"
    assert url == f"{other}/app/agents"


def test_confirm_task_reaches_mentor_when_signed_in() -> None:
    opener = _MentorFake()
    _sign_in("user-a", opener)
    project = create_project(
        "user-a",
        ProjectCreate(name="MENTOR", kind="mentor-hub", repo="mmhaidari2-hash/atnex-app"),
    )
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="fix the login in atnex", language="en")
    )
    done = delegation_service.confirm_task("user-a", task.id, _urlopen=opener)
    assert done.status == "done"
    assert done.plan[0].status == "done"
    assert "abc123" in (done.plan[0].evidence or "")
    assert f"{BASE}/app/agents/abc123" in (done.plan[0].evidence or "")


def test_confirm_task_without_repo_says_which_project() -> None:
    opener = _MentorFake()
    _sign_in("user-a", opener)
    project = create_project("user-a", ProjectCreate(name="MENTOR", kind="mentor-hub"))
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="fix the login", language="en")
    )
    done = delegation_service.confirm_task("user-a", task.id, _urlopen=opener)
    assert done.status == "needs_owner"
    assert "No repo" in (done.plan[0].evidence or "")


def test_planner_picks_codex_engine_from_the_instruction() -> None:
    project = create_project(
        "user-a",
        ProjectCreate(name="MENTOR", kind="mentor-hub", repo="mmhaidari2-hash/atnex-app"),
    )
    task = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="do this with codex", language="en")
    )
    assert task.plan[0].params.get("engine") == "codex"
    task2 = delegation_service.create_task(
        "user-a", project.id, TaskCreate(instruction="do this", language="en")
    )
    assert task2.plan[0].params.get("engine") == "auto"


def test_api_status_without_a_hub_is_empty() -> None:
    _as("user-a")
    response = client.get("/api/v1/mentor/status")
    assert response.status_code == 200
    body = response.json()
    assert body["endpoint"] == ""
    assert body["has_session"] is False
    assert body["worker_state"] == "empty"


def test_api_session_endpoint_stores_endpoint_without_a_probe() -> None:
    _as("user-a")
    response = client.post(
        "/api/v1/mentor/session", json={"endpoint": "https://mentor.example.test"}
    )
    assert response.status_code == 200
    assert response.json()["endpoint"] == "https://mentor.example.test"
    assert response.json()["has_session"] is False


def test_api_task_status_without_session_is_409() -> None:
    _as("user-a")
    client.post("/api/v1/mentor/session", json={"endpoint": BASE})
    response = client.get("/api/v1/mentor/tasks/abc123/status")
    assert response.status_code == 409
    assert "sign-in" in response.json()["detail"]
