from __future__ import annotations

import hashlib
import json
import logging
import random
import threading
import time
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Generic, TypeVar

from .models import DailyBar, Security

T = TypeVar("T")
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProviderResult(Generic[T]):
    provider: str
    endpoint: str
    requested_at: datetime
    fetched_at: datetime
    data_timestamp: str | None
    data_version: str
    items: list[T]
    cache_hit: bool = False
    stale: bool = False
    error: str | None = None


class DataProvider(ABC):
    name: str

    @abstractmethod
    def fetch_securities(self) -> ProviderResult[Security]:
        raise NotImplementedError

    @abstractmethod
    def fetch_daily_bars(self, symbol: str, start: date, end: date) -> ProviderResult[DailyBar]:
        raise NotImplementedError

    @abstractmethod
    def health_check(self) -> dict[str, object]:
        raise NotImplementedError


class RateLimiter:
    def __init__(self, rate_per_second: float) -> None:
        self._interval = 0.0 if rate_per_second <= 0 else 1.0 / rate_per_second
        self._lock = threading.Lock()
        self._last_call = 0.0

    def wait(self) -> None:
        with self._lock:
            remaining = self._interval - (time.monotonic() - self._last_call)
            if remaining > 0:
                time.sleep(remaining)
            self._last_call = time.monotonic()


class JsonCache:
    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def _path(self, key: str) -> Path:
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
        return self.directory / f"{digest}.json"

    def get(self, key: str) -> dict[str, object] | None:
        path = self._path(key)
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None

    def put(self, key: str, payload: dict[str, object]) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        path = self._path(key)
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True), encoding="utf-8")
        temporary.replace(path)


class ResilientProvider:
    """Adds rate limiting, exponential backoff and cache recovery to a provider call."""

    def __init__(self, provider: DataProvider, cache_dir: Path, retries: int = 3, rate_per_second: float = 1.0) -> None:
        self.provider = provider
        self.cache = JsonCache(cache_dir)
        self.retries = max(1, retries)
        self.limiter = RateLimiter(rate_per_second)

    def execute(self, cache_key: str, operation, serialize, deserialize) -> ProviderResult:
        last_error: Exception | None = None
        for attempt in range(self.retries):
            self.limiter.wait()
            try:
                result = operation()
                self.cache.put(cache_key, serialize(result))
                return result
            except Exception as exc:  # provider errors are recorded and retried centrally
                last_error = exc
                logger.warning("provider=%s operation=%s attempt=%s error_type=%s", self.provider.name, cache_key, attempt + 1, type(exc).__name__)
                if attempt + 1 < self.retries:
                    time.sleep((2**attempt) * 0.2 + random.random() * 0.05)
        cached = self.cache.get(cache_key)
        if cached is not None:
            result = deserialize(cached)
            return ProviderResult(**{**asdict(result), "cache_hit": True, "stale": True, "error": f"{type(last_error).__name__}: {last_error}"})
        assert last_error is not None
        raise last_error

