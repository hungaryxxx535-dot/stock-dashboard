from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path


_ENV_LINE = re.compile(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$")


def _load_local_env(project_root: Path) -> None:
    """Load ignored local configuration without overriding the parent environment."""
    for filename in (".env", ".env.local"):
        path = project_root / filename
        if not path.is_file():
            continue
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            match = _ENV_LINE.match(line)
            if not match:
                continue
            value = match.group(2).strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
                value = value[1:-1]
            os.environ.setdefault(match.group(1), value)


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
    api_token: str | None
    api_host: str
    api_port: int
    api_rate_limit_per_minute: int

    @classmethod
    def from_env(cls, root: Path | None = None) -> "Settings":
        project_root = root or Path.cwd()
        _load_local_env(project_root)
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
            api_token=os.getenv("HERMES_QUANT_API_TOKEN") or None,
            api_host=os.getenv("HERMES_QUANT_API_HOST", "127.0.0.1").strip(),
            api_port=int(os.getenv("HERMES_QUANT_API_PORT", "8765")),
            api_rate_limit_per_minute=int(os.getenv("HERMES_QUANT_API_RATE_LIMIT_PER_MINUTE", "120")),
        )
        settings.assert_safe()
        return settings

    def assert_safe(self) -> None:
        if self.execution_mode != "paper":
            raise RuntimeError("HERMES_EXECUTION_MODE must remain 'paper'; real trading is prohibited")
        if self.premarket_push_enabled or self.auction_push_enabled:
            raise RuntimeError("08:00 and 09:25 pushes remain acceptance-gated and must be disabled")
        if self.api_host not in {"127.0.0.1", "localhost", "::1"}:
            raise RuntimeError("quant API must bind to loopback only; 0.0.0.0 and public interfaces are prohibited")
        if not 1 <= self.api_port <= 65535:
            raise RuntimeError("HERMES_QUANT_API_PORT must be between 1 and 65535")
        if self.api_rate_limit_per_minute <= 0:
            raise RuntimeError("HERMES_QUANT_API_RATE_LIMIT_PER_MINUTE must be positive")
