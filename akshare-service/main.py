import json
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import akshare as ak
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

CACHE_SECONDS = int(os.getenv("CACHE_SECONDS", "30"))
SERVICE_TOKEN = os.getenv("AKSHARE_SERVICE_TOKEN", "")
ALLOWED_ORIGINS = [x.strip() for x in os.getenv("ALLOWED_ORIGINS", "*").split(",") if x.strip()]

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

_cache: Dict[str, Any] = {"a": None, "a_at": 0.0, "hk": None, "hk_at": 0.0}
app = FastAPI(title="非哥行情服务", description="A股与港股观察服务", version="0.3.0")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS if ALLOWED_ORIGINS != ["*"] else ["*"], allow_credentials=False, allow_methods=["GET"], allow_headers=["*"])


def beijing_now() -> str:
    return datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S")


def require_token(value: Optional[str]) -> None:
    if SERVICE_TOKEN and value != SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid service token")


def safe_float(value: Any) -> Optional[float]:
    if value is None or value in ("", "-", "--"):
        return None
    try:
        if isinstance(value, str):
            value = value.replace("%", "").replace(",", "").strip()
        result = float(value)
        return result if result == result else None
    except Exception:
        return None


def safe_str(value: Any) -> str:
    return "" if value is None else str(value)


def pick(row: Any, names: List[str], default: Any = None) -> Any:
    for name in names:
        try:
            value = row.get(name) if hasattr(row, "get") else row[name]
            if value is not None and safe_str(value) not in ("", "nan"):
                return value
        except Exception:
            pass
    return default


def market_prefix(code: str) -> str:
    return "1" if code.startswith(("5", "6", "9")) else "0"


def hk_code(value: Any) -> str:
    raw = safe_str(value).upper().replace("HK.", "").replace(".HK", "")
    digits = "".join(ch for ch in raw if ch.isdigit())
    return digits.zfill(5) if digits else raw.strip()


def fetch_a_raw() -> Dict[str, Any]:
    fields = "f12,f14,f2,f3,f4,f17,f15,f16,f18,f5,f6,f8,f7"
    secids = ",".join(f"{market_prefix(x['code'])}.{x['code']}" for x in WATCHLIST)
    params = urlencode({"fltt": "2", "invt": "2", "fields": fields, "secids": secids})
    req = Request(f"https://push2.eastmoney.com/api/qt/ulist.np/get?{params}", headers={"User-Agent": "Mozilla/5.0", "Referer": "https://quote.eastmoney.com/"})
    with urlopen(req, timeout=12) as res:
        return json.loads(res.read().decode("utf-8"))


def a_quote(row: Dict[str, Any], item: Dict[str, str]) -> Dict[str, Any]:
    return {"symbol": item["code"], "name": safe_str(row.get("f14")) or item["name"], "type": item["type"], "role": item.get("role", ""), "price": safe_float(row.get("f2")), "changePct": safe_float(row.get("f3")), "change": safe_float(row.get("f4")), "open": safe_float(row.get("f17")), "high": safe_float(row.get("f15")), "low": safe_float(row.get("f16")), "preClose": safe_float(row.get("f18")), "amount": safe_float(row.get("f6")), "volume": safe_float(row.get("f5")), "turnover": safe_float(row.get("f8")), "amplitude": safe_float(row.get("f7")), "sourceName": safe_str(row.get("f14"))}


def build_a() -> Dict[str, Any]:
    raw = fetch_a_raw()
    diff = raw.get("data", {}).get("diff", []) if isinstance(raw, dict) else []
    rows = {safe_str(x.get("f12")): x for x in diff if isinstance(x, dict)}
    quotes = []
    missing = []
    for item in WATCHLIST:
        row = rows.get(item["code"])
        if row:
            quotes.append(a_quote(row, item))
        else:
            missing.append(item)
            quotes.append({"symbol": item["code"], "name": item["name"], "type": item["type"], "role": item.get("role", ""), "price": None, "changePct": None, "change": None, "open": None, "high": None, "low": None, "preClose": None, "amount": None, "volume": None, "turnover": None, "amplitude": None, "sourceName": "", "error": "not_found"})
    return {"status": "updated", "source": "EastMoney lightweight quote endpoint via Python service", "updatedAt": f"{beijing_now()} 北京时间", "cacheSeconds": CACHE_SECONDS, "quoteCount": len(quotes), "missingCount": len(missing), "missing": missing, "watchlist": WATCHLIST, "quotes": quotes, "disclaimer": "东方财富公开行情源，仅用于盘中观察，不作为唯一交易依据。"}


def build_hk(symbols: str) -> Dict[str, Any]:
    wanted = {hk_code(x) for x in symbols.split(",") if x.strip()}
    df = ak.stock_hk_spot_em()
    quotes = []
    for _, row in df.iterrows():
        symbol = hk_code(pick(row, ["代码", "证券代码", "symbol", "code"], ""))
        if wanted and symbol not in wanted:
            continue
        name = safe_str(pick(row, ["名称", "股票名称", "name"], symbol)) or symbol
        quotes.append({"symbol": symbol, "name": name, "type": "stock", "role": "港股行情", "price": safe_float(pick(row, ["最新价", "现价", "最新"], None)), "changePct": safe_float(pick(row, ["涨跌幅", "涨幅"], None)), "change": safe_float(pick(row, ["涨跌额", "涨跌"], None)), "open": safe_float(pick(row, ["今开", "开盘"], None)), "high": safe_float(pick(row, ["最高"], None)), "low": safe_float(pick(row, ["最低"], None)), "preClose": safe_float(pick(row, ["昨收"], None)), "amount": safe_float(pick(row, ["成交额"], None)), "volume": safe_float(pick(row, ["成交量"], None)), "sourceName": name})
    return {"status": "updated", "source": "AKShare stock_hk_spot_em / 东方财富港股行情", "updatedAt": f"{beijing_now()} 北京时间", "cacheSeconds": CACHE_SECONDS, "quoteCount": len(quotes), "quotes": quotes, "disclaimer": "港股行情来自 AKShare/公开行情接口，仅用于持仓观察和盈亏估算，不代表券商账户实时同步。"}


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"status": "ok", "service": "fei-stock-akshare-api", "mode": "a-share + hk", "time": f"{beijing_now()} 北京时间", "cacheSeconds": CACHE_SECONDS, "watchlistCount": len(WATCHLIST), "hkEndpoint": "/api/hk/spot"}


@app.get("/api/a/watchlist")
def get_watchlist(x_service_token: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_token(x_service_token)
    return {"status": "ok", "count": len(WATCHLIST), "watchlist": WATCHLIST}


@app.get("/api/a/spot")
def a_spot(force: bool = Query(default=False), x_service_token: Optional[str] = Header(default=None)):
    require_token(x_service_token)
    now = time.time()
    if not force and _cache["a"] and now - float(_cache["a_at"]) < CACHE_SECONDS:
        data = dict(_cache["a"])
        data["cacheHit"] = True
        data["servedAt"] = f"{beijing_now()} 北京时间"
        return JSONResponse(content=data)
    try:
        data = build_a()
        data["cacheHit"] = False
        data["servedAt"] = f"{beijing_now()} 北京时间"
        _cache["a"] = data
        _cache["a_at"] = now
        return JSONResponse(content=data)
    except Exception as exc:
        return JSONResponse(status_code=500, content={"status": "failed", "source": "A-share quote service", "updatedAt": f"{beijing_now()} 北京时间", "error": str(exc), "quotes": [], "disclaimer": "公开行情源可能短暂波动，失败时前端应回退静态持仓。"})


@app.get("/api/hk/spot")
def hk_spot(symbols: str = Query(default=""), force: bool = Query(default=False), x_service_token: Optional[str] = Header(default=None)):
    require_token(x_service_token)
    cache_key = ",".join(sorted({hk_code(x) for x in symbols.split(",") if x.strip()})) or "all"
    now = time.time()
    if not force and _cache["hk"] and _cache["hk"].get("key") == cache_key and now - float(_cache["hk_at"]) < CACHE_SECONDS:
        data = dict(_cache["hk"]["data"])
        data["cacheHit"] = True
        data["servedAt"] = f"{beijing_now()} 北京时间"
        return JSONResponse(content=data)
    try:
        data = build_hk(cache_key if cache_key != "all" else "")
        data["cacheHit"] = False
        data["servedAt"] = f"{beijing_now()} 北京时间"
        _cache["hk"] = {"key": cache_key, "data": data}
        _cache["hk_at"] = now
        return JSONResponse(content=data)
    except Exception as exc:
        return JSONResponse(status_code=500, content={"status": "failed", "source": "AKShare stock_hk_spot_em", "updatedAt": f"{beijing_now()} 北京时间", "error": str(exc), "quotes": [], "disclaimer": "AKShare 港股公开行情源可能短暂波动，失败时前端应回退本地持仓。"})
