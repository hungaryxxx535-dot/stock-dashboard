import os
import time
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

import akshare as ak
import pandas as pd
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

MarketType = Literal["stock", "etf"]

CACHE_SECONDS = int(os.getenv("CACHE_SECONDS", "30"))
SERVICE_TOKEN = os.getenv("AKSHARE_SERVICE_TOKEN", "")
ALLOWED_ORIGINS = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",") if origin.strip()]

WATCHLIST: List[Dict[str, str]] = [
    {"code": "588750", "name": "科创芯50", "type": "etf", "role": "第一大仓 / 科创芯片"},
    {"code": "688008", "name": "澜起科技", "type": "stock", "role": "核心个股 / 浮盈保护"},
    {"code": "515880", "name": "通信ETF", "type": "etf", "role": "通信 / CPO 方向"},
    {"code": "588170", "name": "科创半导", "type": "etf", "role": "半导体高相关仓"},
    {"code": "588230", "name": "科创200", "type": "etf", "role": "科创弹性仓"},
    {"code": "159382", "name": "AI创业板", "type": "etf", "role": "AI 弹性仓"},
    {"code": "300476", "name": "胜宏科技", "type": "stock", "role": "PCB / AI 算力链"},
    {"code": "600036", "name": "招商银行", "type": "stock", "role": "防守仓 / 稳定器"},
    {"code": "159834", "name": "金ETF", "type": "etf", "role": "防守仓 / 黄金"},
    {"code": "512400", "name": "有色ETF", "type": "etf", "role": "资源 / 防守观察"},
]

_cache: Dict[str, Any] = {
    "spot": None,
    "spot_at": 0.0,
}

app = FastAPI(
    title="非哥 A股 AKShare 行情服务",
    description="A股盘中观察服务：使用 AKShare 获取东方财富公开行情，统一输出给股票作战台。",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if ALLOWED_ORIGINS != ["*"] else ["*"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def beijing_now() -> str:
    return datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S")


def require_token(x_service_token: Optional[str]) -> None:
    if not SERVICE_TOKEN:
        return
    if x_service_token != SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid AKSHARE_SERVICE_TOKEN")


def safe_float(value: Any) -> Optional[float]:
    if value is None or value == "-" or value == "":
        return None
    try:
        parsed = float(value)
        if pd.isna(parsed):
            return None
        return parsed
    except Exception:
        return None


def safe_str(value: Any) -> str:
    if value is None or pd.isna(value):
        return ""
    return str(value)


def load_stock_spot() -> pd.DataFrame:
    df = ak.stock_zh_a_spot_em()
    if "代码" not in df.columns:
        raise RuntimeError("AKShare stock_zh_a_spot_em 返回字段异常：缺少 代码")
    return df


def load_etf_spot() -> pd.DataFrame:
    df = ak.fund_etf_spot_em()
    if "代码" not in df.columns:
        raise RuntimeError("AKShare fund_etf_spot_em 返回字段异常：缺少 代码")
    return df


def normalize_row(row: pd.Series, item: Dict[str, str], market_type: MarketType) -> Dict[str, Any]:
    price = safe_float(row.get("最新价"))
    change_pct = safe_float(row.get("涨跌幅"))
    change = safe_float(row.get("涨跌额"))
    open_price = safe_float(row.get("今开"))
    high = safe_float(row.get("最高"))
    low = safe_float(row.get("最低"))
    pre_close = safe_float(row.get("昨收"))
    amount = safe_float(row.get("成交额"))
    volume = safe_float(row.get("成交量"))
    turnover = safe_float(row.get("换手率"))
    amplitude = safe_float(row.get("振幅"))

    return {
        "symbol": item["code"],
        "name": safe_str(row.get("名称")) or item["name"],
        "type": market_type,
        "role": item.get("role", ""),
        "price": price,
        "changePct": change_pct,
        "change": change,
        "open": open_price,
        "high": high,
        "low": low,
        "preClose": pre_close,
        "amount": amount,
        "volume": volume,
        "turnover": turnover,
        "amplitude": amplitude,
        "sourceName": safe_str(row.get("名称")),
    }


def build_quotes() -> Dict[str, Any]:
    stock_items = [item for item in WATCHLIST if item["type"] == "stock"]
    etf_items = [item for item in WATCHLIST if item["type"] == "etf"]
    stock_codes = {item["code"] for item in stock_items}
    etf_codes = {item["code"] for item in etf_items}

    stock_df = load_stock_spot()
    etf_df = load_etf_spot()

    quotes: List[Dict[str, Any]] = []
    missing: List[Dict[str, str]] = []

    stock_map = {str(row["代码"]): row for _, row in stock_df[stock_df["代码"].astype(str).isin(stock_codes)].iterrows()}
    etf_map = {str(row["代码"]): row for _, row in etf_df[etf_df["代码"].astype(str).isin(etf_codes)].iterrows()}

    for item in WATCHLIST:
        code = item["code"]
        market_type = item["type"]  # type: ignore[assignment]
        row = stock_map.get(code) if market_type == "stock" else etf_map.get(code)
        if row is None:
            missing.append(item)
            quotes.append({
                "symbol": code,
                "name": item["name"],
                "type": market_type,
                "role": item.get("role", ""),
                "price": None,
                "changePct": None,
                "change": None,
                "open": None,
                "high": None,
                "low": None,
                "preClose": None,
                "amount": None,
                "volume": None,
                "turnover": None,
                "amplitude": None,
                "sourceName": "",
                "error": "not_found_in_akshare_response",
            })
        else:
            quotes.append(normalize_row(row, item, market_type))

    return {
        "status": "updated",
        "source": "AKShare EastMoney public quote",
        "updatedAt": f"{beijing_now()} 北京时间",
        "cacheSeconds": CACHE_SECONDS,
        "quoteCount": len(quotes),
        "missingCount": len(missing),
        "missing": missing,
        "watchlist": WATCHLIST,
        "quotes": quotes,
        "disclaimer": "AKShare 数据来自公开行情源，仅用于盘中观察，不作为唯一交易依据。",
    }


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "service": "fei-stock-akshare-api",
        "time": f"{beijing_now()} 北京时间",
        "cacheSeconds": CACHE_SECONDS,
        "watchlistCount": len(WATCHLIST),
    }


@app.get("/api/a/watchlist")
def get_watchlist(x_service_token: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_token(x_service_token)
    return {
        "status": "ok",
        "count": len(WATCHLIST),
        "watchlist": WATCHLIST,
    }


@app.get("/api/a/spot")
def a_spot(
    force: bool = Query(default=False, description="是否强制绕过缓存重新拉取 AKShare"),
    x_service_token: Optional[str] = Header(default=None),
):
    require_token(x_service_token)

    now = time.time()
    if not force and _cache["spot"] and now - float(_cache["spot_at"]) < CACHE_SECONDS:
        cached = dict(_cache["spot"])
        cached["cacheHit"] = True
        cached["servedAt"] = f"{beijing_now()} 北京时间"
        return JSONResponse(content=cached)

    try:
        data = build_quotes()
        data["cacheHit"] = False
        data["servedAt"] = f"{beijing_now()} 北京时间"
        _cache["spot"] = data
        _cache["spot_at"] = now
        return JSONResponse(content=data)
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={
                "status": "failed",
                "source": "AKShare EastMoney public quote",
                "updatedAt": f"{beijing_now()} 北京时间",
                "error": str(exc),
                "quotes": [],
                "disclaimer": "AKShare 数据源可能短暂波动，失败时前端应回退静态持仓。",
            },
        )
