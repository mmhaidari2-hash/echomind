"""EchoMind → command hub: the generic, pluggable hub slot.

The slot is GENERIC, not MENTOR-only. EchoMind will go to
market as a mobile assistant for customers who do NOT have
MENTOR, so for anyone else the slot stays EMPTY until they plug
in whatever hub they like. For Mahdi the slot is MENTOR — his
command centre for all his projects, connected via API +
GitHub to all his agents, working on his command. EchoMind
talks to the hub; the hub commands everything. The point is
hands-free voice commands: otherwise he could just go to the
hub directly.

MENTOR is the reference hub. Ground truth (repo read
2026-11-26, signed in as mmhaidari2-hash; Mahdi's own phone
screenshots of the live app): MENTOR's production app is
https://mentor-web-production-096b.up.railway.app. There is NO
public JSON task API and NO MCP server. The one real
delegation entry is the owner-only dashboard form:

    POST {endpoint}/app/agents
      form fields: repo, instruction, engine
      ("auto", "codex", "cursor", "routine", "codex_auto",
       "claude_routine", "claude_routine_manual")
      → creates an AgentTask, redirects to /app/agents/{id}
      → results come back as a GitHub PR/branch; the owner
        confirms. No auto-merge.
      → 409 when a task is already active for that repo.

Another hub can be plugged into the same slot as long as it
speaks the same form (repo + instruction + engine, redirect
to /app/agents/{id}); the endpoint is whatever the owner sets.
Nothing in this code assumes the hub is MENTOR — the MENTOR
URL is only the pre-filled example.

The dashboard is session-authenticated (GitHub OAuth), so the
owner's hub session cookie is stored here encrypted with
Fernet (same CONNECTOR_TOKEN_KEY as the other connectors),
server-side only, and NEVER returned to the client. Without a
stored session the executor fails closed with "needs sign-in"
— it never fakes a submission.

Status is read from the hub's own pages, because there is no
JSON status API: /app/agents/{id}/check (fallback
/app/tasks/{id}) for one task, and /app/agents for the worker
state. The hub returns HTML, so states are matched from page
text and reported as "unknown" when the page shows no
recognisable state — never guessed.

What is deliberately NOT used: POST /api/bridge/claim and
POST /api/bridge/tasks/{id}/result are OUTBOUND — MENTOR
delegating work out to a Codex installation. They cannot create
a task, so they are not an inbound route and are never called
here. The file-based HUB.md inbox is left unimplemented: the
private repo returns 404 to the API tools available here, so
its exact inbox format could not be verified and is not guessed.

LIVE CAVEAT (Mahdi's screenshots, 2026-11-26): task execution
is currently PAUSED in MENTOR ("Agents paused — new
instructions stay queued until a worker is enabled"). A
submitted task is still accepted and queued; the executor says
so in its evidence instead of pretending it is running.
"""

from __future__ import annotations

import html as html_lib
import json
import logging
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings
from app.schemas.mentor import MENTOR_PRODUCTION_URL, MENTOR_ENGINES, MentorConnection, MentorTaskStatus

logger = logging.getLogger(__name__)

_STORE = Path(__file__).resolve().parent.parent / "data" / "mentor.json"
_lock = threading.Lock()
_state: dict[str, dict[str, object]] = {}
_path = _STORE

_HTTP_TIMEOUT = 15
_PAUSED_MARKERS = ("agents paused", "task execution is paused", "execution is paused")
_LOGIN_MARKERS = ("/login", "sign in to github", "sign in with github")


class MentorNotConfiguredError(Exception):
    """The server has no encryption key for hub sessions."""


class MentorNotReadyError(Exception):
    """The hub cannot take this yet — sign-in, repo, or endpoint missing."""


class MentorUpstreamError(Exception):
    """The hub could not be reached at all."""


@dataclass
class MentorSubmitResult:
    task_id: str
    task_url: str
    paused: bool | None = None


def use_store_path(path: Path) -> None:
    global _path
    _path = path
    _load()


def _load() -> None:
    global _state
    try:
        raw = _path.read_text(encoding="utf-8") if _path.exists() else "{}"
        parsed = json.loads(raw) if raw.strip() else {}
        _state = parsed if isinstance(parsed, dict) else {}
    except (OSError, ValueError):
        _state = {}


def _dump() -> None:
    _path.parent.mkdir(parents=True, exist_ok=True)
    tmp = _path.with_suffix(".tmp")
    tmp.write_text(json.dumps(_state, ensure_ascii=False, default=str), encoding="utf-8")
    tmp.replace(_path)


def reset_store() -> None:
    global _state
    _state = {}


def _fernet() -> Fernet:
    key = settings.CONNECTOR_TOKEN_KEY.strip().encode("ascii", errors="strict")
    if not key:
        raise MentorNotConfiguredError("Hub session storage is not configured")
    try:
        return Fernet(key)
    except (ValueError, TypeError) as exc:
        raise MentorNotConfiguredError("Hub session encryption key is invalid") from exc


def _record(user_id: str) -> dict[str, object]:
    record = _state.setdefault(
        user_id,
        {"endpoint": "", "cookie_name": "session", "session": None},
    )
    if not isinstance(record, dict):
        record = {"endpoint": "", "cookie_name": "session", "session": None}
        _state[user_id] = record
    record.setdefault("endpoint", "")
    record.setdefault("cookie_name", "session")
    record.setdefault("session", None)
    return record


def _endpoint(record: dict[str, object], override: str | None = None) -> str:
    # The slot is empty until its owner sets an endpoint. No
    # hub is assumed — MENTOR's URL is only the pre-filled
    # example in the UI, never an automatic default.
    if override and override.strip():
        return override.strip().rstrip("/")
    return str(record.get("endpoint") or "").strip().rstrip("/")


def _cookie_name(record: dict[str, object]) -> str:
    name = str(record.get("cookie_name") or "").strip()
    return name or "session"


def _session_cookie(record: dict[str, object]) -> str | None:
    blob = record.get("session")
    if not isinstance(blob, str) or not blob:
        return None
    try:
        return _fernet().decrypt(blob.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, UnicodeDecodeError) as exc:
        raise MentorNotReadyError("The stored hub session cannot be read — sign in to your hub again.") from exc


def get_connection(user_id: str, *, _urlopen=None) -> MentorConnection:
    """The stored connection plus a live probe of the hub.

    The probe is a real GET to the hub's dashboard: it is the only
    way to know whether the stored session still works and
    whether the hub's agents are paused. When the probe cannot run
    (no session, or hub unreachable) the state is "unknown",
    never guessed.
    """
    with _lock:
        record = _record(user_id)
        endpoint = _endpoint(record)
        has_session = isinstance(record.get("session"), str) and bool(record.get("session"))
    if not endpoint:
        return MentorConnection(
            endpoint="",
            cookie_name=_cookie_name(record),
            has_session=has_session,
            session_valid=None,
            paused=None,
            worker_state="empty",
            detail=(
                "No command hub is connected yet. Plug in any hub you like — "
                f"for example MENTOR at {MENTOR_PRODUCTION_URL}."
            ),
        )
    if not has_session:
        return MentorConnection(
            endpoint=endpoint,
            cookie_name=_cookie_name(record),
            has_session=False,
            session_valid=None,
            paused=None,
            worker_state="needs-sign-in",
            detail="No hub session is stored. Sign in to your hub in your browser and paste the session cookie here.",
        )
    try:
        valid, paused = worker_state(user_id, _urlopen=_urlopen)
    except MentorUpstreamError:
        return MentorConnection(
            endpoint=endpoint,
            cookie_name=_cookie_name(record),
            has_session=True,
            session_valid=None,
            paused=None,
            worker_state="unknown",
            detail="The hub could not be reached, so the session could not be checked.",
        )
    if valid is False:
        return MentorConnection(
            endpoint=endpoint,
            cookie_name=_cookie_name(record),
            has_session=True,
            session_valid=False,
            paused=None,
            worker_state="needs-sign-in",
            detail="The stored hub session was rejected. Sign in to your hub again and paste a fresh session cookie.",
        )
    return MentorConnection(
        endpoint=endpoint,
        cookie_name=_cookie_name(record),
        has_session=True,
        session_valid=True,
        paused=paused,
        worker_state="paused" if paused else "ready",
        detail=(
            "The hub's agents are paused — new tasks stay queued until a worker is enabled."
            if paused
            else "The hub is reachable and its agents are running."
        ),
    )


def set_connection(
    user_id: str,
    *,
    endpoint: str | None = None,
    session_cookie: str | None = None,
    cookie_name: str | None = None,
    clear: bool = False,
    _urlopen=None,
) -> MentorConnection:
    """Store (or clear) the hub connection. The cookie is
    encrypted and never returned; only `has_session` reports it.
    After storing, the connection is probed live so the caller
    immediately sees whether the session works and whether
    the hub's agents are paused."""
    with _lock:
        record = _record(user_id)
        if clear:
            record["session"] = None
            _dump()
            return MentorConnection(
                endpoint=_endpoint(record),
                cookie_name=_cookie_name(record),
                has_session=False,
                session_valid=None,
                paused=None,
                worker_state="needs-sign-in",
                detail="Hub session cleared.",
            )
        if endpoint and endpoint.strip():
            record["endpoint"] = endpoint.strip().rstrip("/")
        if cookie_name and cookie_name.strip():
            record["cookie_name"] = cookie_name.strip()
        if session_cookie is not None:
            value = session_cookie.strip()
            record["session"] = _fernet().encrypt(value.encode("utf-8")).decode("ascii") if value else None
        _dump()
    return get_connection(user_id, _urlopen=_urlopen)


def clear_connection(user_id: str, *, _urlopen=None) -> MentorConnection:
    return set_connection(user_id, clear=True, _urlopen=_urlopen)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Do not follow redirects: the hub answers a created task
    with a redirect to /app/agents/{id}, and the Location header
    IS the task id. Following it would lose that."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D102 - urllib hook
        return None


_OPENER = urllib.request.build_opener(_NoRedirect())


def _header(headers: object, name: str) -> str | None:
    if headers is None:
        return None
    get = getattr(headers, "get", None)
    if callable(get):
        try:
            value = get(name)
        except Exception:
            value = None
        if isinstance(value, str):
            return value
    if isinstance(headers, dict):
        value = headers.get(name) or headers.get(name.lower())
        return str(value) if isinstance(value, str) else None
    return None


def _text_of(page: bytes) -> str:
    try:
        text = page.decode("utf-8", errors="replace")
    except Exception:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _fetch(
    url: str, cookie: str | None, cookie_name: str, *, method: str = "GET", data: bytes | None = None, _urlopen=None
) -> tuple[int, object, bytes]:
    """One HTTP call. Returns (status, headers, body). Redirects
    surface as HTTPError with the status and Location preserved,
    so callers can read them instead of losing them."""
    opener = _urlopen or _OPENER.open
    headers = {"User-Agent": "EchoMind", "Accept": "text/html,application/json"}
    if cookie:
        headers["Cookie"] = f"{cookie_name}={cookie}"
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with opener(request, timeout=_HTTP_TIMEOUT) as response:
            return response.status, response.headers, response.read()
    except HTTPError as exc:
        body = b""
        try:
            body = exc.read()
        except Exception:
            body = b""
        return exc.code, exc.headers, body
    except (URLError, TimeoutError, OSError) as exc:
        raise MentorUpstreamError("The hub could not be reached") from exc


def _task_id_from_location(location: str | None) -> str | None:
    if not location:
        return None
    match = re.search(r"/app/agents/([A-Za-z0-9._\-]+)", location)
    return match.group(1) if match else None


def submit_task(
    user_id: str,
    repo: str,
    instruction: str,
    engine: str = "auto",
    *,
    endpoint: str | None = None,
    _urlopen=None,
) -> MentorSubmitResult:
    """Hand one confirmed instruction to the hub via its dashboard
    form: POST {endpoint}/app/agents (repo, instruction, engine).
    A 302/303 to /app/agents/{id} means the task was created.
    Fails closed at every step — nothing is claimed as sent until
    the hub itself redirects to the created task."""
    with _lock:
        record = _record(user_id)
        base = _endpoint(record, endpoint)
        cookie = _session_cookie(record)
        name = _cookie_name(record)
    if not base:
        raise MentorNotReadyError(
            "No command hub is connected yet — set the hub endpoint first "
            f"(for example MENTOR at {MENTOR_PRODUCTION_URL}). Nothing was sent."
        )
    if not cookie:
        raise MentorNotReadyError(
            "Hub sign-in is missing — sign in to your hub in your browser, "
            "paste the session cookie into EchoMind, then confirm again. "
            "Nothing was sent to the hub."
        )
    repo = (repo or "").strip()
    if not repo:
        raise MentorNotReadyError(
            "No repo is linked to this hub project — say which project "
            "the hub should work on (owner/repo)."
        )
    engine = (engine or "auto").strip() or "auto"
    if engine not in MENTOR_ENGINES:
        engine = "auto"
    fields = urllib.parse.urlencode(
        {"repo": repo, "instruction": instruction.strip(), "engine": engine}
    ).encode("utf-8")
    status, headers, _body = _fetch(
        f"{base}/app/agents", cookie, name, method="POST", data=fields, _urlopen=_urlopen
    )
    if status in (301, 302, 303, 307, 308):
        task_id = _task_id_from_location(_header(headers, "Location"))
        if task_id:
            paused: bool | None = None
            try:
                _valid, paused = worker_state(user_id, _urlopen=_urlopen, endpoint=base)
            except MentorUpstreamError:
                paused = None
            return MentorSubmitResult(
                task_id=task_id, task_url=f"{base}/app/agents/{task_id}", paused=paused
            )
        raise MentorUpstreamError(
            "The hub answered with a redirect but no task id — the task may not have been created."
        )
    if status == 409:
        raise MentorNotReadyError(
            f"The hub already has an active task for {repo} — wait for it or finish it first. Nothing new was sent."
        )
    if status in (401, 403):
        raise MentorNotReadyError(
            "The hub rejected the stored session — sign in to your hub again and paste a fresh session cookie."
        )
    if status == 200:
        raise MentorUpstreamError(
            "The hub did not create the task — it answered HTTP 200 instead of redirecting to a new task. "
            "Check the instruction and try again."
        )
    raise MentorUpstreamError(f"The hub answered HTTP {status} — the task was not created.")


def worker_state(
    user_id: str, *, _urlopen=None, endpoint: str | None = None
) -> tuple[bool | None, bool | None]:
    """(session_valid, paused) from the hub's own dashboard page.

    GET /app/agents (fallback /app/tasks): a 200 means the session
    works; the page says "Agents paused" while execution is paused.
    A redirect to /login (or 401/403) means the session is dead.
    Returns (None, None) when no session is stored at all."""
    with _lock:
        record = _record(user_id)
        base = _endpoint(record, endpoint)
        cookie = _session_cookie(record)
        name = _cookie_name(record)
    if not base:
        return None, None
    if not cookie:
        return None, None
    for path in ("/app/agents", "/app/tasks"):
        status, headers, body = _fetch(f"{base}{path}", cookie, name, _urlopen=_urlopen)
        if status in (301, 302, 303, 307, 308):
            location = (_header(headers, "Location") or "").lower()
            if any(marker in location for marker in _LOGIN_MARKERS):
                return False, None
            continue
        if status in (401, 403):
            return False, None
        if status == 404:
            continue
        if status != 200:
            raise MentorUpstreamError(f"The hub answered HTTP {status} while checking its state.")
        text = _text_of(body).lower()
        paused = any(marker in text for marker in _PAUSED_MARKERS)
        return True, paused
    return None, None


_TASK_STATE_MARKERS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("ready-to-merge", ("ready to merge",)),
    ("waiting-for-you", ("waiting for your decision", "waiting for you")),
    ("finished", ("finished", "completed", "done — merged", "merged")),
    ("queued", ("agents paused", "task execution is paused", "execution is paused", "queued", "waiting for a worker")),
    ("running", ("tasks moving", "moving", "running", "in progress", "executing")),
)


def check_task_status(
    user_id: str, mentor_task_id: str, *, _urlopen=None, endpoint: str | None = None
) -> MentorTaskStatus:
    """Read one hub task's state from its own status page.

    /app/agents/{id}/check, falling back to /app/tasks/{id}.
    The hub returns HTML, so the state is matched from page text
    and reported as "unknown" when the page shows no recognisable
    state — never guessed."""
    with _lock:
        record = _record(user_id)
        base = _endpoint(record, endpoint)
        cookie = _session_cookie(record)
        name = _cookie_name(record)
    if not base:
        raise MentorNotReadyError(
            "No command hub is connected yet — set the hub endpoint first "
            f"(for example MENTOR at {MENTOR_PRODUCTION_URL})."
        )
    if not cookie:
        raise MentorNotReadyError(
            "Hub sign-in is missing — sign in to your hub in your browser and paste the session cookie first."
        )
    task_id = (mentor_task_id or "").strip()
    if not task_id:
        raise MentorNotReadyError("No hub task id was given.")
    body: bytes | None = None
    for path in (f"/app/agents/{task_id}/check", f"/app/tasks/{task_id}"):
        status, _headers, payload = _fetch(f"{base}{path}", cookie, name, _urlopen=_urlopen)
        if status in (401, 403):
            raise MentorNotReadyError(
                "The hub rejected the stored session — sign in to your hub again and paste a fresh session cookie."
            )
        if status == 404:
            continue
        if status != 200:
            raise MentorUpstreamError(f"The hub answered HTTP {status} while checking task {task_id}.")
        body = payload
        break
    url = f"{base}/app/agents/{task_id}"
    if body is None:
        return MentorTaskStatus(
            task_id=task_id,
            state="unknown",
            detail="The hub has no task with this id.",
            url=url,
            paused=None,
        )
    text = _text_of(body).lower()
    paused = True if any(marker in text for marker in _PAUSED_MARKERS) else None
    for state, markers in _TASK_STATE_MARKERS:
        if any(marker in text for marker in markers):
            return MentorTaskStatus(
                task_id=task_id,
                state=state,
                detail=f"The hub's own page says: {state}.",
                url=url,
                paused=paused,
            )
    return MentorTaskStatus(
        task_id=task_id,
        state="unknown",
        detail="The hub's page did not show a recognisable state for this task.",
        url=url,
        paused=paused,
    )


_load()
