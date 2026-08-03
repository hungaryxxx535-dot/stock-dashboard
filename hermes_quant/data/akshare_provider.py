from __future__ import annotations

import hashlib
import json
from datetime import date, datetime
from typing import Any

from .models import DailyBar, Security
from .provider import DataProvider, ProviderResult


def _float(value: Any) -> float:
    return float(str(value).replace(",", ""))


class AkShareProvider(DataProvider):
    name = "akshare"

    def __init__(self, module=None) -> None:
        if module is None:
            import akshare as module  # lazy import keeps offline core dependency-light
        self.ak = module

    @staticmethod
    def _version(endpoint: str, payload: object) -> str:
        raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")
        return f"{endpoint}:{hashlib.sha256(raw).hexdigest()[:16]}"

    def fetch_securities(self) -> ProviderResult[Security]:
        requested = datetime.now().astimezone()
        frames = [
            (self.ak.stock_info_sh_name_code(symbol="主板A股"), "SSE", "MAIN", "stock_info_sh_name_code:主板A股"),
            (self.ak.stock_info_sh_name_code(symbol="科创板"), "SSE", "STAR", "stock_info_sh_name_code:科创板"),
            (self.ak.stock_info_sz_name_code(symbol="A股列表"), "SZSE", None, "stock_info_sz_name_code:A股列表"),
        ]
        by_symbol: dict[str, Security] = {}
        for frame, exchange, fixed_board, endpoint in frames:
            for _, row in frame.iterrows():
                symbol = str(row.get("证券代码", row.get("A股代码", ""))).zfill(6)
                raw_listing = row.get("上市日期", row.get("A股上市日期"))
                if not symbol or not raw_listing:
                    continue
                listing_date = raw_listing if isinstance(raw_listing, date) else date.fromisoformat(str(raw_listing)[:10])
                raw_board = str(row.get("板块", ""))
                board = fixed_board or ("CHINEXT" if "创业" in raw_board or symbol.startswith("300") else "MAIN")
                by_symbol[symbol] = Security(symbol=symbol, name=str(row.get("证券简称", row.get("A股简称", symbol))), exchange=exchange, board=board, security_type="stock", listing_date=listing_date, valid_from=listing_date, source=f"{self.name}:{endpoint}")
        items = [by_symbol[key] for key in sorted(by_symbol)]
        fetched = datetime.now().astimezone()
        version = self._version("stock_info_sh_name_code+stock_info_sz_name_code", [(x.symbol, x.name, x.listing_date) for x in items])
        return ProviderResult(self.name, "stock_info_sh_name_code+stock_info_sz_name_code", requested, fetched, None, version, items)

    def fetch_daily_bars(self, symbol: str, start: date, end: date) -> ProviderResult[DailyBar]:
        requested = datetime.now().astimezone()
        endpoint = "stock_zh_a_hist"
        frame = self.ak.stock_zh_a_hist(symbol=symbol, period="daily", start_date=start.strftime("%Y%m%d"), end_date=end.strftime("%Y%m%d"), adjust="")
        items: list[DailyBar] = []
        previous_close: float | None = None
        for _, row in frame.iterrows():
            trade_date = date.fromisoformat(str(row["日期"])[:10])
            close = _float(row["收盘"])
            items.append(DailyBar(symbol=symbol, trade_date=trade_date, open=_float(row["开盘"]), high=_float(row["最高"]), low=_float(row["最低"]), close=close, volume=_float(row["成交量"]), amount=_float(row["成交额"]), prev_close=previous_close, source=self.name, fetched_at=datetime.now().astimezone()))
            previous_close = close
        fetched = datetime.now().astimezone()
        version = self._version(endpoint, [item.to_record() for item in items])
        items = [DailyBar(**{**item.__dict__, "data_version": version}) for item in items]
        timestamp = items[-1].trade_date.isoformat() if items else None
        return ProviderResult(self.name, endpoint, requested, fetched, timestamp, version, items)

    def health_check(self) -> dict[str, object]:
        return {"provider": self.name, "status": "available", "version": getattr(self.ak, "__version__", "unknown"), "checked_at": datetime.now().astimezone().isoformat(), "network_checked": False}
