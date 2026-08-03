from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime
from typing import Any


@dataclass(frozen=True)
class Security:
    symbol: str
    name: str
    exchange: str
    board: str
    security_type: str
    listing_date: date
    delisting_date: date | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    source: str = "unknown"

    def to_record(self) -> dict[str, Any]:
        record = asdict(self)
        for key in ("listing_date", "delisting_date", "valid_from", "valid_to"):
            value = record[key]
            record[key] = value.isoformat() if value else None
        record["valid_from"] = record["valid_from"] or record["listing_date"]
        return record


@dataclass(frozen=True)
class DailyBar:
    symbol: str
    trade_date: date
    open: float
    high: float
    low: float
    close: float
    volume: float
    amount: float
    prev_close: float | None = None
    adjusted: str = "none"
    source: str = "unknown"
    fetched_at: datetime | None = None
    data_version: str = "unversioned"

    def to_record(self) -> dict[str, Any]:
        record = asdict(self)
        record["trade_date"] = self.trade_date.isoformat()
        record["fetched_at"] = (self.fetched_at or datetime.now().astimezone()).isoformat()
        return record


@dataclass(frozen=True)
class IntervalStatus:
    symbol: str
    effective_from: datetime
    effective_to: datetime | None
    status: str
    source: str
    announced_at: datetime | None = None


@dataclass(frozen=True)
class Announcement:
    symbol: str
    announcement_id: str
    title: str
    published_at: datetime
    source: str
    url: str | None = None

