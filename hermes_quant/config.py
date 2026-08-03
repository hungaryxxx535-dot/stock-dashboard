from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    database_path: Path
    cache_dir: Path
    http_proxy: str | None
    request_timeout_seconds: float
    request_rate_per_second: float
    max_retries: int
    execution_mode: str
    scheduler_enabled: bool
    premarket_push_enabled: bool
    auction_push_enabled: bool
    feishu_webhook_url: str | None

    @classmethod
    def from_env(cls, root: Path | None = None) -> "Settings":
        project_root = root or Path.cwd()
        private_root = project_root / ".local-private"
        settings = cls(
            database_path=Path(os.getenv("HERMES_DB_PATH", private_root / "hermes_quant.db")),
            cache_dir=Path(os.getenv("HERMES_CACHE_DIR", private_root / "cache")),
            http_proxy=os.getenv("HERMES_HTTP_PROXY") or None,
            request_timeout_seconds=float(os.getenv("HERMES_REQUEST_TIMEOUT_SECONDS", "20")),
            request_rate_per_second=float(os.getenv("HERMES_REQUEST_RATE_PER_SECOND", "1")),
            max_retries=int(os.getenv("HERMES_MAX_RETRIES", "3")),
            execution_mode=os.getenv("HERMES_EXECUTION_MODE", "paper").strip().lower(),
            scheduler_enabled=_flag("HERMES_SCHEDULER_ENABLED"),
            premarket_push_enabled=_flag("HERMES_0800_PUSH_ENABLED"),
            auction_push_enabled=_flag("HERMES_0925_PUSH_ENABLED"),
            feishu_webhook_url=os.getenv("FEISHU_WEBHOOK_URL") or None,
        )
        settings.assert_safe()
        return settings

    def assert_safe(self) -> None:
        if self.execution_mode != "paper":
            raise RuntimeError("HERMES_EXECUTION_MODE must remain 'paper'; real trading is prohibited")
        if self.premarket_push_enabled or self.auction_push_enabled:
            raise RuntimeError("08:00 and 09:25 pushes remain acceptance-gated and must be disabled")

