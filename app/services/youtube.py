"""Import des vidéos d'une playlist YouTube (chaîne H-Learning).

Deux sources, la meilleure disponible est utilisée :
- API YouTube Data v3 si `YOUTUBE_API_KEY` est renseignée : toute la
  playlist, avec les durées ;
- sinon le flux RSS public de la playlist : aucune clé nécessaire, mais
  YouTube ne renvoie que les 15 dernières vidéos et pas les durées.
"""
import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Optional
from urllib.parse import parse_qs, urlparse

import httpx

from app.config import settings

logger = logging.getLogger("hcompany.youtube")

_PLAYLIST_ID = re.compile(r"^[A-Za-z0-9_-]{10,60}$")
_VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


class YouTubeError(Exception):
    """Erreur lisible renvoyée à l'admin (clé invalide, playlist privée...)."""


def parse_playlist_id(value: Optional[str]) -> Optional[str]:
    """Accepte un lien de playlist YouTube ou directement son identifiant."""
    if not value:
        return None
    value = value.strip()
    if _PLAYLIST_ID.match(value) and "/" not in value and "." not in value:
        return value
    try:
        qs = parse_qs(urlparse(value).query)
    except ValueError:
        return None
    listed = (qs.get("list") or [None])[0]
    return listed if listed and _PLAYLIST_ID.match(listed) else None


def parse_video_id(value: Optional[str]) -> Optional[str]:
    """Accepte un lien YouTube (watch, youtu.be, embed, shorts) ou un ID."""
    if not value:
        return None
    value = value.strip()
    if _VIDEO_ID.match(value):
        return value
    try:
        url = urlparse(value)
    except ValueError:
        return None
    host = (url.hostname or "").lower().removeprefix("www.").removeprefix("m.")
    if host == "youtu.be":
        candidate = url.path.strip("/").split("/")[0]
    elif host in ("youtube.com", "youtube-nocookie.com"):
        parts = [p for p in url.path.split("/") if p]
        if parts and parts[0] in ("embed", "shorts", "live", "v") and len(parts) > 1:
            candidate = parts[1]
        else:
            candidate = (parse_qs(url.query).get("v") or [""])[0]
    else:
        return None
    return candidate if _VIDEO_ID.match(candidate or "") else None


def _iso_duration_to_seconds(iso: str) -> Optional[int]:
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso or "")
    if not m:
        return None
    d, h, mi, s = (int(x or 0) for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + s


def _parse_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def thumbnail_for(video_id: str) -> str:
    return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"


def _fetch_api(playlist_id: str, api_key: str) -> list[dict]:
    items: list[dict] = []
    token = None
    with httpx.Client(timeout=15) as client:
        for _ in range(20):  # 20 pages x 50 = 1000 vidéos max
            params = {"part": "snippet,contentDetails", "playlistId": playlist_id, "maxResults": 50, "key": api_key}
            if token:
                params["pageToken"] = token
            resp = client.get("https://www.googleapis.com/youtube/v3/playlistItems", params=params)
            if resp.status_code != 200:
                reason = ""
                try:
                    reason = resp.json()["error"]["errors"][0]["reason"]
                except Exception:
                    pass
                if resp.status_code == 404:
                    raise YouTubeError("Playlist introuvable ou privée.")
                if reason in ("keyInvalid", "forbidden", "quotaExceeded", "accessNotConfigured"):
                    raise YouTubeError(f"Clé YouTube refusée ({reason}).")
                raise YouTubeError(f"YouTube a répondu {resp.status_code}.")
            data = resp.json()
            for it in data.get("items", []):
                sn = it.get("snippet", {})
                vid = (sn.get("resourceId") or {}).get("videoId")
                title = sn.get("title") or ""
                if not vid or title in ("Private video", "Deleted video"):
                    continue
                items.append({
                    "youtube_id": vid,
                    "title": title,
                    "description": (sn.get("description") or "")[:1000],
                    "published_at": _parse_date((it.get("contentDetails") or {}).get("videoPublishedAt") or sn.get("publishedAt")),
                })
            token = data.get("nextPageToken")
            if not token:
                break

        # Durées : une requête par lot de 50 vidéos.
        for i in range(0, len(items), 50):
            batch = items[i:i + 50]
            resp = client.get(
                "https://www.googleapis.com/youtube/v3/videos",
                params={"part": "contentDetails", "id": ",".join(b["youtube_id"] for b in batch), "key": api_key},
            )
            if resp.status_code != 200:
                break  # les durées sont un plus : on garde les vidéos
            durations = {v["id"]: _iso_duration_to_seconds(v["contentDetails"]["duration"]) for v in resp.json().get("items", [])}
            for b in batch:
                b["duration_seconds"] = durations.get(b["youtube_id"])
    return items


_NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015", "m": "http://search.yahoo.com/mrss/"}


def _fetch_rss(playlist_id: str) -> list[dict]:
    try:
        resp = httpx.get(
            "https://www.youtube.com/feeds/videos.xml",
            params={"playlist_id": playlist_id},
            timeout=15,
            follow_redirects=True,
        )
    except httpx.RequestError as exc:
        raise YouTubeError("YouTube est injoignable pour le moment.") from exc
    if resp.status_code == 404:
        raise YouTubeError("Playlist introuvable ou privée (le flux public n'existe pas).")
    if resp.status_code != 200:
        raise YouTubeError(f"YouTube a répondu {resp.status_code}.")
    try:
        root = ET.fromstring(resp.content)
    except ET.ParseError as exc:
        raise YouTubeError("Réponse YouTube illisible.") from exc
    items = []
    for entry in root.findall("a:entry", _NS):
        vid = entry.findtext("yt:videoId", namespaces=_NS)
        if not vid:
            continue
        items.append({
            "youtube_id": vid,
            "title": entry.findtext("a:title", default="", namespaces=_NS),
            "description": (entry.findtext("m:group/m:description", default="", namespaces=_NS) or "")[:1000],
            "published_at": _parse_date(entry.findtext("a:published", namespaces=_NS)),
            "duration_seconds": None,
        })
    # Le flux liste du plus récent au plus ancien ; un cours se suit dans
    # l'ordre de publication.
    items.reverse()
    return items


def fetch_playlist(playlist_id: str) -> list[dict]:
    """Vidéos de la playlist, dans l'ordre où elles doivent être suivies."""
    if settings.youtube_api_key:
        return _fetch_api(playlist_id, settings.youtube_api_key)
    return _fetch_rss(playlist_id)
