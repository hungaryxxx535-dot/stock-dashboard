from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from .repository import QuantRepository


@dataclass(frozen=True)
class PriceLimitRule:
    board: str
    risk_status: str | None
    limit_up_pct: float | None
    limit_down_pct: float | None
    effective_from: date
    effective_to: date | None
    source: str


class PriceLimitRuleResolver:
    def __init__(self, repository: QuantRepository) -> None:
        self.repository = repository

    def resolve(self, board: str, trade_date: date, risk_status: str | None = None) -> PriceLimitRule | None:
        with self.repository.session() as connection:
            row = connection.execute("""
                SELECT board,risk_status,limit_up_pct,limit_down_pct,effective_from,effective_to,source
                FROM price_limit_rules
                WHERE board=? AND effective_from<=? AND (effective_to IS NULL OR effective_to>?)
                  AND (risk_status=? OR (risk_status IS NULL AND ? IS NULL))
                ORDER BY effective_from DESC LIMIT 1
            """, (board, trade_date.isoformat(), trade_date.isoformat(), risk_status, risk_status)).fetchone()
        if not row:
            return None
        return PriceLimitRule(row["board"], row["risk_status"], row["limit_up_pct"], row["limit_down_pct"], date.fromisoformat(row["effective_from"]), date.fromisoformat(row["effective_to"]) if row["effective_to"] else None, row["source"])

