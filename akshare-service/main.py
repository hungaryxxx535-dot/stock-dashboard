import json
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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

_cache: Dict[str, Any] = {"spot": None, "spot_at": 0.0}

app = FastAPI(
    title="非哥 A股行情服务",
    description="A股盘中观察服务：轻量请求东方财富公开行情，统一输出给股票作战台。",
    version="0.2.0",
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
        return parsed if parsed == parsed else None
    except Exception:
        return None


def safe_str(value: Any) -> str:
    return "" if value is None else str(value)


def eastmoney_market_prefix(code: str) -> str:
    # EastMoney secid: 1 = Shanghai, 0 = Shenzhen.
    if code.startswith(("5", "6", "9")):
        return "1"
    return "0"


def build_secids() -> str:
    return ",".join(f"{eastmoney_market_prefix(item['code'])}.{item['code']}" for item in WATCHLIST)


def fetch_eastmoney_quotes() -> Dict[str, Any]:
    fields = "f12,f14,f2,f3,f4,f17,f15,f16,f18,f5,f6,f8,f7"
    params = urlencode({
        "fltt": "2",
        "invt": "2",
        "fields": fields,
        "secids": build_secids(),
    })
    url = f"https://push2.eastmoney.com/api/qt/ulist.np/get?{params}"
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; fei-stock-dashboard/0.2)",
            "Referer": "https://quote.eastmoney.com/",
        },
    )
    with urlopen(request, timeout=12) as response:
        raw = response.read().decode("utf-8")
    return json.loads(raw)


def normalize_quote(row: Dict[str, Any], item: Dict[str, str]) -> Dict[str, Any]:
    return {
        "symbol": item["code"],
        "name": safe_str(row.get("f14")) or item["name"],
        "type": item["type"],
        "role": item.get("role", ""),
        "price": safe_float(row.get("f2")),
        "changePct": safe_float(row.get("f3")),
        "change": safe_float(row.get("f4")),
        "open": safe_float(row.get("f17")),
        "high": safe_float(row.get("f15")),
        "low": safe_float(row.get("f16")),
        "preClose": safe_float(row.get("f18")),
        "amount": safe_float(row.get("f6")),
        "volume": safe_float(row.get("f5")),
        "turnover": safe_float(row.get("f8")),
        "amplitude": safe_float(row.get("f7")),
        "sourceName": safe_str(row.get("f14")),
    }


def build_quotes() -> Dict[str, Any]:
    payload = fetch_eastmoney_quotes()
    diff = payload.get("data", {}).get("diff", []) if isinstance(payload, dict) else []
    rows = {safe_str(row.get("f12")): row for row in diff if isinstance(row, dict)}

    quotes: List[Dict[str, Any]] = []
    missing: List[Dict[str, str]] = []

    for item in WATCHLIST:
        code = item["code"]
        row = rows.get(code)
        if row is None:
            missing.append(item)
            quotes.append({
                "symbol": code,
                "name": item["name"],
                "type": item["type"],
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
                "error": "not_found_in_eastmoney_response",
            })
        else:
            quotes.append(normalize_quote(row, item))

    return {
        "status": "updated",
        "source": "EastMoney lightweight quote endpoint via Python service",
        "updatedAt": f"{beijing_now()} 北京时间",
        "cacheSeconds": CACHE_SECONDS,
        "quoteCount": len(quotes),
        "missingCount": len(missing),
        "missing": missing,
        "watchlist": WATCHLIST,
        "quotes": quotes,
        "disclaimer": "东方财富公开行情源，仅用于盘中观察，不作为唯一交易依据。",
    }


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "service": "fei-stock-akshare-api",
        "mode": "lightweight-eastmoney",
        "time": f"{beijing_now()} 北京时间",
        "cacheSeconds": CACHE_SECONDS,
        "watchlistCount": len(WATCHLIST),
    }


@app.get("/api/a/watchlist")
def get_watchlist(x_service_token: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_token(x_service_token)
    return {"status": "ok", "count": len(WATCHLIST), "watchlist": WATCHLIST}


@app.get("/api/a/spot")
def a_spot(
    force: bool = Query(default=False, description="是否强制绕过缓存重新拉取行情"),
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
                "source": "EastMoney lightweight quote endpoint via Python service",
                "updatedAt": f"{beijing_now()} 北京时间",
                "error": str(exc),
                "quotes": [],
                "disclaimer": "公开行情源可能短暂波动，失败时前端应回退静态持仓。",
            },
        )
