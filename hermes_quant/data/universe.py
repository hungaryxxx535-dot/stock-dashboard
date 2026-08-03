from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timezone

from .repository import QuantRepository


@dataclass(frozen=True)
class UniverseMember:
    symbol: str
    name: str
    exchange: str
    board: str
    risk_status: str | None
    suspended: bool


class PointInTimeUniverse:
    def __init__(self, repository: QuantRepository) -> None:
        self.repository = repository

    def members(self, as_of: date, known_at: datetime | None = None, exclude_risk_warning: bool = True, require_tradable: bool = True) -> list[UniverseMember]:
        cutoff = known_at or datetime.combine(as_of, time(23, 59, 59), tzinfo=timezone.utc)
        as_of_text = as_of.isoformat()
        cutoff_text = cutoff.isoformat()
        sql = """
            SELECT s.symbol,s.name,s.exchange,s.board,
              (SELECT r.status FROM risk_warning_history r WHERE r.symbol=s.symbol
                 AND r.effective_from<=? AND (r.effective_to IS NULL OR r.effective_to>?)
                 AND (r.announced_at IS NULL OR r.announced_at<=?) ORDER BY r.effective_from DESC LIMIT 1) AS risk_status,
              EXISTS(SELECT 1 FROM suspension_history p WHERE p.symbol=s.symbol
                 AND p.effective_from<=? AND (p.effective_to IS NULL OR p.effective_to>?)
                 AND (p.announced_at IS NULL OR p.announced_at<=?)) AS suspended
            FROM securities_master s
            WHERE s.listing_date<=? AND (s.delisting_date IS NULL OR s.delisting_date>=?)
              AND s.valid_from<=? AND (s.valid_to IS NULL OR s.valid_to>?)
            ORDER BY s.symbol
        """
        params = (cutoff_text, cutoff_text, cutoff_text, cutoff_text, cutoff_text, cutoff_text, as_of_text, as_of_text, as_of_text, as_of_text)
        with self.repository.session() as connection:
            rows = connection.execute(sql, params).fetchall()
        members = [UniverseMember(row["symbol"], row["name"], row["exchange"], row["board"], row["risk_status"], bool(row["suspended"])) for row in rows]
        if exclude_risk_warning:
            members = [item for item in members if not item.risk_status or item.risk_status.upper() in {"NORMAL", "NONE"}]
        if require_tradable:
            members = [item for item in members if not item.suspended]
        return members

    def announcements_known(self, symbol: str, signal_time: datetime) -> list[dict[str, str]]:
        with self.repository.session() as connection:
            rows = connection.execute("SELECT announcement_id,title,published_at,source FROM announcements WHERE symbol=? AND published_at<=? ORDER BY published_at", (symbol, signal_time.isoformat())).fetchall()
        return [dict(row) for row in rows]
