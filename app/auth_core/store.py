"""Stockage éphémère (compteurs anti brute-force, `state` OAuth). Redis si REDIS_URL, sinon mémoire du process."""
import time
from typing import Optional

from app.config import settings

try:
    import redis as redis_lib

    _redis = redis_lib.from_url(settings.redis_url) if settings.redis_url else None
except ImportError:  # pragma: no cover
    _redis = None

_mem: dict[str, tuple[str, float]] = {}


def set_value(key: str, value: str, ttl_seconds: int) -> None:
    if _redis:
        _redis.set(key, value, ex=ttl_seconds)
        return
    _mem[key] = (value, time.time() + ttl_seconds)


def get_value(key: str) -> Optional[str]:
    if _redis:
        v = _redis.get(key)
        return v.decode() if v else None
    entry = _mem.get(key)
    if not entry:
        return None
    if time.time() > entry[1]:
        _mem.pop(key, None)
        return None
    return entry[0]


def delete_value(key: str) -> None:
    if _redis:
        _redis.delete(key)
        return
    _mem.pop(key, None)


def increment(key: str, ttl_seconds: int) -> int:
    if _redis:
        pipe = _redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, ttl_seconds, nx=True)
        count, _ = pipe.execute()
        return int(count)
    entry = _mem.get(key)
    now = time.time()
    if not entry or now > entry[1]:
        _mem[key] = ("1", now + ttl_seconds)
        return 1
    count = int(entry[0]) + 1
    _mem[key] = (str(count), entry[1])
    return count
