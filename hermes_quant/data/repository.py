from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Iterable, Iterator

from .models import Announcement, DailyBar, IndustryMembership, IntervalStatus, MinuteBar, Security


class QuantRepository:
    def __init__(self, database_path: Path | str) -> None:
        self.database_path = str(database_path)
        if self.database_path != ":memory:":
            Path(self.database_path).parent.mkdir(parents=True, exist_ok=True)

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    @contextmanager
    def session(self) -> Iterator[sqlite3.Connection]:
        connection = self.connect()
        try:
            yield connection
        finally:
            connection.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        with self.session() as connection:
            with connection:
                yield connection

    def migrate(self, migrations_dir: Path | str) -> list[str]:
        applied: list[str] = []
        directory = Path(migrations_dir)
        with self.transaction() as connection:
            connection.execute("CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
            known = {row[0] for row in connection.execute("SELECT version FROM schema_migrations")}
            for path in sorted(directory.glob("*.sql")):
                if path.name in known:
                    continue
                connection.executescript(path.read_text(encoding="utf-8"))
                connection.execute("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", (path.name, datetime.now().astimezone().isoformat()))
                applied.append(path.name)
        return applied

    def upsert_securities(self, securities: Iterable[Security]) -> int:
        records = [item.to_record() for item in securities]
        with self.transaction() as connection:
            connection.executemany("""
                INSERT INTO securities_master(symbol,name,exchange,board,security_type,listing_date,delisting_date,valid_from,valid_to,source)
                VALUES(:symbol,:name,:exchange,:board,:security_type,:listing_date,:delisting_date,:valid_from,:valid_to,:source)
                ON CONFLICT(symbol,valid_from) DO UPDATE SET name=excluded.name, exchange=excluded.exchange, board=excluded.board,
                    security_type=excluded.security_type, listing_date=excluded.listing_date, delisting_date=excluded.delisting_date,
                    valid_to=excluded.valid_to, source=excluded.source
            """, records)
        return len(records)

    def upsert_daily_bars(self, bars: Iterable[DailyBar]) -> int:
        records = [item.to_record() for item in bars]
        with self.transaction() as connection:
            connection.executemany("""
                INSERT INTO daily_bars(symbol,trade_date,open,high,low,close,volume,amount,prev_close,adjusted,source,fetched_at,data_version)
                VALUES(:symbol,:trade_date,:open,:high,:low,:close,:volume,:amount,:prev_close,:adjusted,:source,:fetched_at,:data_version)
                ON CONFLICT(symbol,trade_date,adjusted,source) DO UPDATE SET open=excluded.open, high=excluded.high, low=excluded.low,
                    close=excluded.close, volume=excluded.volume, amount=excluded.amount, prev_close=excluded.prev_close,
                    fetched_at=excluded.fetched_at, data_version=excluded.data_version
            """, records)
        return len(records)

    def upsert_minute_bars(self, bars: Iterable[MinuteBar]) -> int:
        records = [item.to_record() for item in bars]
        with self.transaction() as connection:
            connection.executemany("""
                INSERT INTO minute_bars(symbol,bar_time,open,high,low,close,volume,amount,source,fetched_at,data_version)
                VALUES(:symbol,:bar_time,:open,:high,:low,:close,:volume,:amount,:source,:fetched_at,:data_version)
                ON CONFLICT(symbol,bar_time,source) DO UPDATE SET open=excluded.open,high=excluded.high,low=excluded.low,
                    close=excluded.close,volume=excluded.volume,amount=excluded.amount,fetched_at=excluded.fetched_at,
                    data_version=excluded.data_version
            """, records)
        return len(records)

    def upsert_industry_memberships(self, memberships: Iterable[IndustryMembership]) -> int:
        records = [item.to_record() for item in memberships]
        with self.transaction() as connection:
            connection.executemany("""
                INSERT INTO industry_membership_history(symbol,industry_code,industry_name,classification,effective_from,effective_to,announced_at,source)
                VALUES(:symbol,:industry_code,:industry_name,:classification,:effective_from,:effective_to,:announced_at,:source)
                ON CONFLICT DO UPDATE SET industry_name=excluded.industry_name,effective_to=excluded.effective_to,
                    announced_at=excluded.announced_at,source=excluded.source
            """, records)
        return len(records)

    def upsert_announcements(self, announcements: Iterable[Announcement]) -> int:
        records = [
            {
                "announcement_id": item.announcement_id,
                "symbol": item.symbol,
                "title": item.title,
                "published_at": item.published_at.isoformat(),
                "url": item.url,
                "source": item.source,
            }
            for item in announcements
        ]
        with self.transaction() as connection:
            connection.executemany("""
                INSERT INTO announcements(announcement_id,symbol,title,published_at,url,source)
                VALUES(:announcement_id,:symbol,:title,:published_at,:url,:source)
                ON CONFLICT(announcement_id) DO UPDATE SET symbol=excluded.symbol,title=excluded.title,
                    published_at=excluded.published_at,url=excluded.url,source=excluded.source
            """, records)
        return len(records)

    def add_interval_status(self, table: str, status: IntervalStatus) -> None:
        allowed = {"risk_warning_history", "suspension_history", "listing_history", "delisting_history"}
        if table not in allowed:
            raise ValueError(f"unsupported interval table: {table}")
        with self.transaction() as connection:
            connection.execute(f"INSERT INTO {table}(symbol,effective_from,effective_to,status,announced_at,source) VALUES(?,?,?,?,?,?)", (status.symbol, status.effective_from.isoformat(), status.effective_to.isoformat() if status.effective_to else None, status.status, status.announced_at.isoformat() if status.announced_at else None, status.source))

    def add_announcement(self, item: Announcement) -> None:
        self.upsert_announcements([item])

    def start_sync_run(self, provider: str, endpoint: str, requested_range: dict[str, str]) -> str:
        run_id = str(uuid.uuid4())
        with self.transaction() as connection:
            connection.execute("INSERT INTO data_sync_runs(run_id,provider,endpoint,started_at,status,requested_range) VALUES(?,?,?,?,?,?)", (run_id, provider, endpoint, datetime.now().astimezone().isoformat(), "running", json.dumps(requested_range, ensure_ascii=False)))
        return run_id

    def finish_sync_run(self, run_id: str, status: str, row_count: int, data_version: str | None = None, error_type: str | None = None, error_message: str | None = None) -> None:
        with self.transaction() as connection:
            connection.execute("UPDATE data_sync_runs SET finished_at=?, status=?, row_count=?, data_version=?, error_type=?, error_message=? WHERE run_id=?", (datetime.now().astimezone().isoformat(), status, row_count, data_version, error_type, error_message, run_id))

    def log_quality(self, dataset: str, severity: str, check_name: str, message: str, symbol: str | None = None, trade_date: str | None = None) -> None:
        with self.transaction() as connection:
            connection.execute("INSERT INTO data_quality_log(dataset,symbol,trade_date,severity,check_name,message,created_at) VALUES(?,?,?,?,?,?,?)", (dataset, symbol, trade_date, severity, check_name, message, datetime.now().astimezone().isoformat()))

    def latest_daily_bar_date(self, symbol: str, source: str = "akshare") -> str | None:
        with self.session() as connection:
            row = connection.execute("SELECT MAX(trade_date) FROM daily_bars WHERE symbol=? AND source=?", (symbol, source)).fetchone()
        return row[0] if row and row[0] else None
