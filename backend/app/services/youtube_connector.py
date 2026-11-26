"""YouTube connector — reads the owner's channel and videos, read-only.

YouTube rides the repo's Google OAuth: the same Google account and the
same encrypted token store. ``begin`` requests the Google authorisation
URL with the extra ``youtube.readonly`` scope, and ``complete`` is the
Google connector's own callback (the redirect URI is shared — the
callback page says "Google connected"; the YouTube scope lands on the
same token). No separate Google client, no separate secret.

Read-only: channel + recent uploads. No uploads, no comments, no writes.
"""

from __future__ import annotations

import json
import logging
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.schemas.connectors import YouTubeChannel, YouTubeVideo
from app.services import google_connector
from app.services.google_connector import (
    ConnectorNotConfiguredError,
    ConnectorNotConnectedError,
    ConnectorPermissionError,
    ConnectorUpstreamError,
    GoogleAccessLevel,
)

# The four Connector* errors are re-exported here: the YouTube flow
# raises Google's own errors (shared token), and the endpoint maps them
# to HTTP statuses from this module.
__all__ = [
    "ConnectorNotConfiguredError",
    "ConnectorNotConnectedError",
    "ConnectorPermissionError",
    "ConnectorUpstreamError",
]

logger = logging.getLogger(__name__)

YOUTUBE_ROOT = "https://www.googleapis.com/youtube/v3"
YOUTUBE_READONLY = "https://www.googleapis.com/auth/youtube.readonly"
_HTTP_TIMEOUT = 20


def configured() -> bool:
    """YouTube needs the Google connector configured — same client,
    same redirect URI, no extra secret."""
    return google_connector.configured()


def status(user_id: str) -> dict[str, object]:
    """Real status: Google configured + a token is stored + the
    youtube.readonly scope was granted. A token without the scope is
    NOT connected for YouTube."""
    if not google_connector.configured():
        return {"configured": False, "connected": False, "scopes": []}
    google_status = google_connector.status(user_id)
    scopes = list(google_status.scopes)
    connected = bool(google_status.connected and YOUTUBE_READONLY in scopes)
    return {"configured": True, "connected": connected, "scopes": scopes}


def begin(user_id: str) -> str:
    if not google_connector.configured():
        raise ConnectorNotConfiguredError("Google connector is not configured")
    return google_connector.begin(
        user_id, GoogleAccessLevel.read, extra_scopes=(YOUTUBE_READONLY,)
    )


def _get_json(url: str, access_token: str) -> dict[str, object]:
    request = Request(
        url,
        method="GET",
        headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=_HTTP_TIMEOUT) as response:
            raw = response.read()
            payload = json.loads(raw.decode("utf-8")) if raw else {}
    except HTTPError as exc:
        logger.warning("youtube.api_http_error status=%s", exc.code)
        raise ConnectorUpstreamError(f"YouTube API request failed ({exc.code})") from exc
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        logger.warning("youtube.api_transport_error type=%s", type(exc).__name__)
        raise ConnectorUpstreamError("YouTube API is temporarily unavailable") from exc
    return payload if isinstance(payload, dict) else {}


def channel(user_id: str) -> YouTubeChannel:
    access = google_connector.access_token_for_scope(user_id, YOUTUBE_READONLY)
    query = urlencode({"part": "snippet,statistics,contentDetails", "mine": "true"})
    payload = _get_json(f"{YOUTUBE_ROOT}/channels?{query}", access)
    items = payload.get("items")
    if not isinstance(items, list) or not items or not isinstance(items[0], dict):
        raise ConnectorUpstreamError("YouTube did not return a channel")
    item = items[0]
    snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
    statistics = item.get("statistics") if isinstance(item.get("statistics"), dict) else {}
    content = item.get("contentDetails") if isinstance(item.get("contentDetails"), dict) else {}
    related = content.get("relatedPlaylists") if isinstance(content.get("relatedPlaylists"), dict) else {}
    thumbnails = snippet.get("thumbnails") if isinstance(snippet.get("thumbnails"), dict) else {}
    default_thumb = thumbnails.get("default") if isinstance(thumbnails.get("default"), dict) else {}
    return YouTubeChannel(
        id=str(item.get("id", "")),
        title=str(snippet.get("title", "")),
        description=str(snippet.get("description", "")),
        subscribers=int(statistics.get("subscriberCount", 0) or 0),
        video_count=int(statistics.get("videoCount", 0) or 0),
        thumbnail_url=str(default_thumb.get("url")) if default_thumb.get("url") else None,
        uploads_playlist_id=str(related.get("uploads")) if related.get("uploads") else None,
    )


def recent_videos(user_id: str, limit: int = 10) -> list[YouTubeVideo]:
    safe_limit = min(max(limit, 1), 20)
    own = channel(user_id)
    if not own.uploads_playlist_id:
        return []
    access = google_connector.access_token_for_scope(user_id, YOUTUBE_READONLY)
    query = urlencode(
        {
            "part": "snippet,contentDetails",
            "playlistId": own.uploads_playlist_id,
            "maxResults": safe_limit,
        }
    )
    payload = _get_json(f"{YOUTUBE_ROOT}/playlistItems?{query}", access)
    items = payload.get("items")
    rows: list[YouTubeVideo] = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
        content = item.get("contentDetails") if isinstance(item.get("contentDetails"), dict) else {}
        video_id = content.get("videoId") or (snippet.get("resourceId") or {}).get("videoId")
        if not isinstance(video_id, str) or not video_id:
            continue
        thumbnails = snippet.get("thumbnails") if isinstance(snippet.get("thumbnails"), dict) else {}
        default_thumb = thumbnails.get("default") if isinstance(thumbnails.get("default"), dict) else {}
        rows.append(
            YouTubeVideo(
                id=video_id,
                title=str(snippet.get("title", "")),
                published_at=str(snippet.get("publishedAt", "")),
                thumbnail_url=str(default_thumb.get("url")) if default_thumb.get("url") else None,
                url=f"https://www.youtube.com/watch?v={video_id}",
            )
        )
    return rows
