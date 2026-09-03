from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from datetime import date
from typing import Callable

from hermes_quant.config import Settings
from hermes_quant.data.repository import QuantRepository


@dataclass(frozen=True)
class JobSpec:
    job_id: str
    local_time: str
    description: str
    enabled: bool = False


def default_job_specs(settings: Settings) -> tuple[JobSpec, ...]:
    globally = settings.scheduler_enabled
    return (
        JobSpec("data_sync", "07:30", "数据同步、质量与持仓风险", globally),
        JobSpec("premarket_candidates", "08:00", "0—3只盘前候选，不是买入指令", globally and settings.premarket_push_enabled),
        JobSpec("auction_review", "09:25", "集合竞价复核，最终0—3只", globally and settings.auction_push_enabled),
        JobSpec("paper_order_monitor", "09:30", "仅触发预设条件时生成模拟订单", globally),
        JobSpec("midday_risk", "11:30", "订单、成交与风险检查", globally),
        JobSpec("closing_decision", "14:30", "尾盘持仓决策", globally),
        JobSpec("settlement", "15:10", "模拟账户结算", globally),
        JobSpec("daily_review", "15:30", "复盘与可选飞书报告", globally),
    )


@dataclass(frozen=True)
class JobRunResult:
    run_id: str
    status: str
    attempts: int
    duplicate: bool = False


class DailyScheduler:
    def __init__(self, repository: QuantRepository, specs: tuple[JobSpec, ...], is_trading_day: Callable[[date], bool], retries: int = 3) -> None:
        self.repository = repository
        self.specs = {spec.job_id: spec for spec in specs}
        self.is_trading_day = is_trading_day
        self.retries = max(1, retries)

    def run(self, job_id: str, trade_date: date, callback: Callable[[str], None]) -> JobRunResult:
        spec = self.specs[job_id]
        if not spec.enabled:
            return JobRunResult("disabled", "disabled", 0)
        if not self.is_trading_day(trade_date):
            return JobRunResult("closed", "non_trading_day", 0)
        idempotency_key = f"{job_id}:{trade_date.isoformat()}"
        with self.repository.transaction() as connection:
            existing = connection.execute("SELECT run_id,status,attempts FROM scheduler_runs WHERE idempotency_key=?", (idempotency_key,)).fetchone()
            if existing and existing["status"] == "succeeded":
                return JobRunResult(existing["run_id"], "succeeded", existing["attempts"], True)
            run_id = existing["run_id"] if existing else str(uuid.uuid4())
            connection.execute("INSERT OR IGNORE INTO scheduler_runs(run_id,job_id,trade_date,idempotency_key,status,attempts,started_at) VALUES(?,?,?,?,?,?,datetime('now'))", (run_id, job_id, trade_date.isoformat(), idempotency_key, "running", 0))
        attempts = 0
        error_type = error_message = None
        status = "failed"
        for attempt in range(self.retries):
            attempts += 1
            try:
                callback(run_id)
                status = "succeeded"
                break
            except Exception as exc:
                error_type, error_message = type(exc).__name__, str(exc)[:500]
                if attempt + 1 < self.retries:
                    time.sleep(0.05 * 2**attempt)
        with self.repository.transaction() as connection:
            connection.execute("UPDATE scheduler_runs SET status=?,attempts=?,finished_at=datetime('now'),error_type=?,error_message=? WHERE run_id=?", (status, attempts, error_type, error_message, run_id))
        return JobRunResult(run_id, status, attempts)

