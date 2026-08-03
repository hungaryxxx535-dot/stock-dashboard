from __future__ import annotations

from dataclasses import dataclass

from .models import DailyBar


@dataclass(frozen=True)
class QualityIssue:
    severity: str
    check_name: str
    message: str
    symbol: str | None = None
    trade_date: str | None = None


def validate_daily_bars(bars: list[DailyBar]) -> list[QualityIssue]:
    issues: list[QualityIssue] = []
    seen: set[tuple[str, str]] = set()
    ordered = sorted(bars, key=lambda item: (item.symbol, item.trade_date))
    for bar in ordered:
        key = (bar.symbol, bar.trade_date.isoformat())
        if key in seen:
            issues.append(QualityIssue("error", "duplicate_bar", "duplicate symbol/trade_date", bar.symbol, key[1]))
        seen.add(key)
        if min(bar.open, bar.high, bar.low, bar.close) <= 0:
            issues.append(QualityIssue("error", "non_positive_price", "OHLC contains non-positive price", bar.symbol, key[1]))
        if bar.low > min(bar.open, bar.close) or bar.high < max(bar.open, bar.close) or bar.low > bar.high:
            issues.append(QualityIssue("error", "invalid_ohlc", "OHLC ordering is invalid", bar.symbol, key[1]))
        if bar.volume < 0 or bar.amount < 0:
            issues.append(QualityIssue("error", "negative_liquidity", "volume or amount is negative", bar.symbol, key[1]))
    return issues

