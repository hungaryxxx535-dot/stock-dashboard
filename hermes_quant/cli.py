from __future__ import annotations

import argparse
import json
import sys
import tempfile
from dataclasses import asdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from hermes_quant.backtest.engine import BacktestConfig, BacktestSignal, EventDrivenBacktester
from hermes_quant.config import Settings
from hermes_quant.data.akshare_provider import AkShareProvider
from hermes_quant.data.models import DailyBar, Security
from hermes_quant.data.provider import ProviderResult, ResilientProvider
from hermes_quant.data.repository import QuantRepository
from hermes_quant.data.universe import PointInTimeUniverse
from hermes_quant.data.validation import validate_daily_bars
from hermes_quant.paper.models import FeeSchedule, MarketBar, Side
from hermes_quant.scheduler.jobs import default_job_specs


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "migrations"


def emit(payload: dict[str, object]) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2, default=str))


def init_db(settings: Settings) -> int:
    repository = QuantRepository(settings.database_path)
    applied = repository.migrate(MIGRATIONS)
    emit({"status": "ok", "database": str(settings.database_path), "applied_migrations": applied, "execution_mode": settings.execution_mode, "scheduler_enabled": settings.scheduler_enabled, "gated_pushes_enabled": False})
    return 0


def smoke() -> int:
    with tempfile.TemporaryDirectory() as directory:
        repository = QuantRepository(Path(directory) / "smoke.db")
        applied = repository.migrate(MIGRATIONS)
        repository.upsert_securities([Security("600001", "SMOKE FIXTURE", "SSE", "MAIN", "stock", date(2020, 1, 1), source="TEST_FIXTURE")])
        universe = PointInTimeUniverse(repository).members(date(2024, 1, 2))
        base = datetime(2024, 1, 1, 7, tzinfo=timezone.utc)
        bars = [MarketBar("600001", base + timedelta(days=day), (base + timedelta(days=day)).date(), price, price * 1.02, price * 0.98, price, 100_000) for day, price in ((1, 10), (2, 11), (3, 12), (4, 13))]
        signals = [BacktestSignal("A", "smoke-v1", "600001", Side.BUY, base, 1000, 10.5), BacktestSignal("A", "smoke-v1", "600001", Side.SELL, base + timedelta(days=2, hours=-1), 1000, 11.5)]
        result = EventDrivenBacktester(BacktestConfig(100_000, FeeSchedule(slippage_bps=0, impact_bps_at_full_participation=0), "TEST_FIXTURE")).run(bars, signals)
        if len(universe) != 1 or result.metrics.total_trades != 1:
            emit({"status": "failed", "reason": "smoke assertion failed"})
            return 1
        emit({"status": "ok", "fixture_only": True, "migrations": applied, "universe_members": len(universe), "paper_orders": len(result.orders), "closed_trades": result.metrics.total_trades, "reproducible_data_version": result.config.data_version, "warning": "This is a TEST_FIXTURE mechanism smoke test, not a real backtest result."})
    return 0


def _serialize_bars(result: ProviderResult[DailyBar]) -> dict[str, object]:
    return {"provider": result.provider, "endpoint": result.endpoint, "requested_at": result.requested_at.isoformat(), "fetched_at": result.fetched_at.isoformat(), "data_timestamp": result.data_timestamp, "data_version": result.data_version, "items": [bar.to_record() for bar in result.items]}


def _deserialize_bars(payload: dict[str, object]) -> ProviderResult[DailyBar]:
    items = []
    for raw in payload["items"]:
        item = dict(raw)
        item["trade_date"] = date.fromisoformat(item["trade_date"])
        item["fetched_at"] = datetime.fromisoformat(item["fetched_at"])
        items.append(DailyBar(**item))
    return ProviderResult(str(payload["provider"]), str(payload["endpoint"]), datetime.fromisoformat(str(payload["requested_at"])), datetime.fromisoformat(str(payload["fetched_at"])), payload.get("data_timestamp"), str(payload["data_version"]), items)


def _serialize_securities(result: ProviderResult[Security]) -> dict[str, object]:
    return {"provider": result.provider, "endpoint": result.endpoint, "requested_at": result.requested_at.isoformat(), "fetched_at": result.fetched_at.isoformat(), "data_timestamp": result.data_timestamp, "data_version": result.data_version, "items": [item.to_record() for item in result.items]}


def _deserialize_securities(payload: dict[str, object]) -> ProviderResult[Security]:
    items = []
    for raw in payload["items"]:
        item = dict(raw)
        for key in ("listing_date", "delisting_date", "valid_from", "valid_to"):
            item[key] = date.fromisoformat(item[key]) if item.get(key) else None
        items.append(Security(**item))
    return ProviderResult(str(payload["provider"]), str(payload["endpoint"]), datetime.fromisoformat(str(payload["requested_at"])), datetime.fromisoformat(str(payload["fetched_at"])), payload.get("data_timestamp"), str(payload["data_version"]), items)


def sync_securities(settings: Settings) -> int:
    repository = QuantRepository(settings.database_path)
    repository.migrate(MIGRATIONS)
    provider = AkShareProvider()
    resilient = ResilientProvider(provider, settings.cache_dir, settings.max_retries, settings.request_rate_per_second, settings.request_timeout_seconds)
    run_id = repository.start_sync_run(provider.name, "security_master_current_snapshot", {})
    try:
        result = resilient.execute("akshare:securities:current", provider.fetch_securities, _serialize_securities, _deserialize_securities)
        rows = repository.upsert_securities(result.items)
        repository.finish_sync_run(run_id, "succeeded_with_scope_warning", rows, result.data_version)
        emit({"status": "ok", "run_id": run_id, "rows": rows, "data_version": result.data_version, "fetched_at": result.fetched_at, "cache_hit": result.cache_hit, "scope": "current listed A-shares with actual listing dates", "warning": "Delisted securities and historical status changes are not supplied by this snapshot; it is insufficient for historical PIT backtests."})
        return 0
    except Exception as exc:
        repository.finish_sync_run(run_id, "failed", 0, error_type=type(exc).__name__, error_message=str(exc)[:500])
        emit({"status": "failed", "run_id": run_id, "error_type": type(exc).__name__, "error": str(exc)[:500], "rows_written": 0})
        return 1


def sync_bars(settings: Settings, symbol: str, start: date, end: date, incremental: bool) -> int:
    repository = QuantRepository(settings.database_path)
    repository.migrate(MIGRATIONS)
    if incremental:
        latest = repository.latest_daily_bar_date(symbol)
        if latest:
            start = max(start, date.fromisoformat(latest) + timedelta(days=1))
    if start > end:
        emit({"status": "ok", "symbol": symbol, "rows": 0, "reason": "already_up_to_date"})
        return 0
    provider = AkShareProvider()
    resilient = ResilientProvider(provider, settings.cache_dir, settings.max_retries, settings.request_rate_per_second, settings.request_timeout_seconds)
    run_id = repository.start_sync_run(provider.name, "stock_zh_a_hist", {"symbol": symbol, "start": start.isoformat(), "end": end.isoformat()})
    cache_key = f"akshare:daily:{symbol}:{start.isoformat()}:{end.isoformat()}"
    try:
        result = resilient.execute(cache_key, lambda: provider.fetch_daily_bars(symbol, start, end), _serialize_bars, _deserialize_bars)
        issues = validate_daily_bars(result.items)
        for issue in issues:
            repository.log_quality("daily_bars", issue.severity, issue.check_name, issue.message, issue.symbol, issue.trade_date)
        errors = [issue for issue in issues if issue.severity == "error"]
        if errors:
            repository.finish_sync_run(run_id, "failed_quality", 0, result.data_version, "DataQualityError", f"{len(errors)} validation errors")
            emit({"status": "failed_quality", "run_id": run_id, "errors": len(errors), "rows_written": 0})
            return 2
        rows = repository.upsert_daily_bars(result.items)
        repository.finish_sync_run(run_id, "succeeded", rows, result.data_version)
        emit({"status": "ok", "run_id": run_id, "provider": result.provider, "endpoint": result.endpoint, "symbol": symbol, "start": start, "end": end, "data_timestamp": result.data_timestamp, "fetched_at": result.fetched_at, "data_version": result.data_version, "rows": rows, "cache_hit": result.cache_hit, "stale": result.stale, "quality_errors": 0})
        return 0
    except Exception as exc:
        repository.finish_sync_run(run_id, "failed", 0, error_type=type(exc).__name__, error_message=str(exc)[:500])
        emit({"status": "failed", "run_id": run_id, "provider": provider.name, "endpoint": "stock_zh_a_hist", "error_type": type(exc).__name__, "error": str(exc)[:500], "rows_written": 0})
        return 1


def doctor(settings: Settings) -> int:
    repository = QuantRepository(settings.database_path)
    applied = repository.migrate(MIGRATIONS)
    provider = AkShareProvider()
    emit({"status": "ok", "python": sys.version.split()[0], "provider": provider.health_check(), "database": str(settings.database_path), "new_migrations": applied, "execution_mode": settings.execution_mode, "scheduler_jobs": [asdict(spec) for spec in default_job_specs(settings)], "feishu_configured": bool(settings.feishu_webhook_url), "secrets_printed": False})
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="Hermes A-share research and paper-trading core")
    commands = root.add_subparsers(dest="command", required=True)
    commands.add_parser("init-db")
    commands.add_parser("smoke")
    commands.add_parser("doctor")
    commands.add_parser("sync-securities")
    sync = commands.add_parser("sync-bars")
    sync.add_argument("--symbol", required=True)
    sync.add_argument("--start", required=True, type=date.fromisoformat)
    sync.add_argument("--end", required=True, type=date.fromisoformat)
    sync.add_argument("--incremental", action="store_true")
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if args.command == "smoke":
        return smoke()
    settings = Settings.from_env(ROOT)
    if args.command == "init-db":
        return init_db(settings)
    if args.command == "doctor":
        return doctor(settings)
    if args.command == "sync-securities":
        return sync_securities(settings)
    if args.command == "sync-bars":
        return sync_bars(settings, args.symbol, args.start, args.end, args.incremental)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
