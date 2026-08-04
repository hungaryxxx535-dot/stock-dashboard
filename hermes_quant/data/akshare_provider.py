from __future__ import annotations

import hashlib
import json
import os
from datetime import date, datetime, timedelta
from typing import Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import requests

from .models import Announcement, DailyBar, IndustryMembership, MinuteBar, Security
from .provider import DataProvider, ProviderResult


def configure_http_environment(explicit_proxy: str | None) -> str:
    """Make AkShare proxy choice explicit without exposing credentials."""
    value = (explicit_proxy or "").strip()
    if value.lower() == "direct":
        for name in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
            os.environ.pop(name, None)
        os.environ["NO_PROXY"] = "*"
        return "direct"
    if value:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https", "socks5", "socks5h"} or not parsed.hostname:
            raise ValueError("HERMES_HTTP_PROXY must be a valid proxy URL or 'direct'")
        os.environ["HTTP_PROXY"] = value
        os.environ["HTTPS_PROXY"] = value
        os.environ.pop("NO_PROXY", None)
        return "explicit"
    if any(os.getenv(name) for name in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY")):
        return "environment"
    # requests otherwise inherits WinINET on Windows, including stale local
    # proxy ports. An unconfigured Hermes process should make a direct request.
    os.environ["NO_PROXY"] = "*"
    return "direct"


def _float(value: Any) -> float:
    return float(str(value).replace(",", ""))


class AkShareProvider(DataProvider):
    name = "akshare"

    def __init__(self, module=None, http_get=None) -> None:
        if module is None:
            import akshare as module  # lazy import keeps offline core dependency-light
        self.ak = module
        self.http_get = http_get or requests.get

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
        try:
            frame = self.ak.stock_zh_a_hist(symbol=symbol, period="daily", start_date=start.strftime("%Y%m%d"), end_date=end.strftime("%Y%m%d"), adjust="")
            if frame.empty:
                raise ValueError("eastmoney returned no daily bars")
        except Exception:
            endpoint = "stock_zh_a_daily"
            exchange_symbol = ("sh" if symbol.startswith("6") else "sz") + symbol
            frame = self.ak.stock_zh_a_daily(symbol=exchange_symbol, start_date=start.strftime("%Y%m%d"), end_date=end.strftime("%Y%m%d"), adjust="")
        items: list[DailyBar] = []
        previous_close: float | None = None
        for index, row in frame.iterrows():
            raw_date = row["日期"] if "日期" in row else row["date"] if "date" in row else index
            trade_date = date.fromisoformat(str(raw_date)[:10])
            close = _float(row["收盘"] if "收盘" in row else row["close"])
            open_price = row["开盘"] if "开盘" in row else row["open"]
            high = row["最高"] if "最高" in row else row["high"]
            low = row["最低"] if "最低" in row else row["low"]
            volume = row["成交量"] if "成交量" in row else row["volume"]
            amount = row["成交额"] if "成交额" in row else row.get("amount", 0)
            items.append(DailyBar(symbol=symbol, trade_date=trade_date, open=_float(open_price), high=_float(high), low=_float(low), close=close, volume=_float(volume), amount=_float(amount), prev_close=previous_close, source=f"{self.name}:{endpoint}", fetched_at=datetime.now().astimezone()))
            previous_close = close
        fetched = datetime.now().astimezone()
        version = self._version(endpoint, [item.to_record() for item in items])
        items = [DailyBar(**{**item.__dict__, "data_version": version}) for item in items]
        timestamp = items[-1].trade_date.isoformat() if items else None
        return ProviderResult(self.name, endpoint, requested, fetched, timestamp, version, items)

    def fetch_minute_bars(
        self, symbol: str, start: datetime, end: datetime, period: str = "5"
    ) -> ProviderResult[MinuteBar]:
        requested = datetime.now().astimezone()
        endpoint = "stock_zh_a_hist_min_em"
        try:
            frame = self.ak.stock_zh_a_hist_min_em(
                symbol=symbol,
                start_date=start.strftime("%Y-%m-%d %H:%M:%S"),
                end_date=end.strftime("%Y-%m-%d %H:%M:%S"),
                period=period,
                adjust="",
            )
            if frame.empty:
                raise ValueError("eastmoney returned no minute bars")
        except Exception:
            endpoint = "stock_zh_a_minute"
            exchange_symbol = ("sh" if symbol.startswith("6") else "sz") + symbol
            frame = self.ak.stock_zh_a_minute(symbol=exchange_symbol, period=period, adjust="")
        shanghai = ZoneInfo("Asia/Shanghai")
        start_local = start if start.tzinfo else start.replace(tzinfo=shanghai)
        end_local = end if end.tzinfo else end.replace(tzinfo=shanghai)
        fetched = datetime.now().astimezone()
        raw_items: list[dict[str, Any]] = []
        for _, row in frame.iterrows():
            raw_time = row.get("时间", row.get("day", row.get("日期")))
            if raw_time is None:
                continue
            bar_time = datetime.fromisoformat(str(raw_time)).replace(tzinfo=shanghai)
            if not (start_local <= bar_time <= end_local):
                continue
            raw_items.append(
                {
                    "symbol": symbol,
                    "bar_time": bar_time,
                    "open": _float(row.get("开盘", row.get("open"))),
                    "high": _float(row.get("最高", row.get("high"))),
                    "low": _float(row.get("最低", row.get("low"))),
                    "close": _float(row.get("收盘", row.get("close"))),
                    "volume": _float(row.get("成交量", row.get("volume"))),
                    "amount": _float(row.get("成交额", row.get("amount", 0))),
                    "source": f"{self.name}:{endpoint}",
                    "fetched_at": fetched,
                }
            )
        version = self._version(endpoint, raw_items)
        items = [MinuteBar(**item, data_version=version) for item in raw_items]
        timestamp = items[-1].bar_time.isoformat() if items else None
        return ProviderResult(self.name, endpoint, requested, fetched, timestamp, version, items)

    def fetch_industry_history(
        self, symbol: str, start: date, end: date
    ) -> ProviderResult[IndustryMembership]:
        requested = datetime.now().astimezone()
        endpoint = "stock_industry_change_cninfo"
        frame = self.ak.stock_industry_change_cninfo(
            symbol=symbol,
            start_date=start.strftime("%Y%m%d"),
            end_date=end.strftime("%Y%m%d"),
        )
        fetched = datetime.now().astimezone()
        raw_rows: list[dict[str, Any]] = []
        for _, row in frame.iterrows():
            effective = row.get("变更日期")
            if effective is None:
                continue
            raw_rows.append(
                {
                    "symbol": str(row.get("证券代码", symbol)).zfill(6),
                    "industry_code": str(row.get("行业编码") or "UNKNOWN"),
                    "industry_name": str(row.get("行业大类") or row.get("行业门类") or "UNKNOWN"),
                    "classification": str(row.get("分类标准") or "CNINFO"),
                    "effective_from": date.fromisoformat(str(effective)[:10]),
                    "announced_at": fetched,
                    "source": f"{self.name}:{endpoint}",
                }
            )
        raw_rows.sort(key=lambda item: item["effective_from"])
        items = [
            IndustryMembership(
                **item,
                effective_to=(raw_rows[index + 1]["effective_from"] - timedelta(days=1))
                if index + 1 < len(raw_rows)
                else None,
            )
            for index, item in enumerate(raw_rows)
        ]
        version = self._version(endpoint, [item.to_record() for item in items])
        timestamp = max((item.effective_from for item in items), default=None)
        return ProviderResult(
            self.name, endpoint, requested, fetched, timestamp.isoformat() if timestamp else None, version, items
        )

    def fetch_announcements(
        self, symbol: str, start: date, end: date
    ) -> ProviderResult[Announcement]:
        requested = datetime.now().astimezone()
        endpoint = "np-anotice-stock.eastmoney.com/api/security/ann"
        url = "https://np-anotice-stock.eastmoney.com/api/security/ann"
        params = {
            "sr": "-1",
            "page_size": "100",
            "page_index": "1",
            "ann_type": "A",
            "client_source": "web",
            "f_node": "0",
            "s_node": "0",
            "stock_list": symbol,
            "begin_time": start.isoformat(),
            "end_time": end.isoformat(),
        }
        response = self.http_get(url, params=params, timeout=20)
        response.raise_for_status()
        payload = response.json()
        data = payload.get("data") or {}
        total_hits = int(data.get("total_hits") or 0)
        pages = max(1, (total_hits + 99) // 100)
        rows: list[dict[str, Any]] = []
        for page in range(1, pages + 1):
            if page == 1:
                page_data = data
            else:
                params["page_index"] = str(page)
                page_response = self.http_get(url, params=params, timeout=20)
                page_response.raise_for_status()
                page_data = (page_response.json().get("data") or {})
            rows.extend(page_data.get("list") or [])
        fetched = datetime.now().astimezone()
        items: list[Announcement] = []
        for row in rows:
            codes = row.get("codes") or []
            stock_code = next(
                (str(code.get("stock_code")) for code in codes if str(code.get("stock_code")) == symbol),
                symbol,
            )
            published_raw = row.get("notice_date") or row.get("display_time")
            if not published_raw or not row.get("art_code"):
                continue
            published = datetime.fromisoformat(str(published_raw).replace(":000", ".000")[:23])
            published = published.replace(tzinfo=ZoneInfo("Asia/Shanghai"))
            art_code = str(row["art_code"])
            items.append(
                Announcement(
                    symbol=stock_code,
                    announcement_id=art_code,
                    title=str(row.get("title") or row.get("title_ch") or art_code),
                    published_at=published,
                    source=f"{self.name}:{endpoint}",
                    url=f"https://data.eastmoney.com/notices/detail/{stock_code}/{art_code}.html",
                )
            )
        version = self._version(endpoint, [item.__dict__ for item in items])
        timestamp = max((item.published_at for item in items), default=None)
        return ProviderResult(
            self.name, endpoint, requested, fetched, timestamp.isoformat() if timestamp else None, version, items
        )

    def health_check(self) -> dict[str, object]:
        return {"provider": self.name, "status": "available", "version": getattr(self.ak, "__version__", "unknown"), "checked_at": datetime.now().astimezone().isoformat(), "network_checked": False}
