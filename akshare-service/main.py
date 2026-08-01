import json
import os
import re
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

# A private deployment may supply its own symbols. Never commit a user's
# portfolio as the service-wide default watchlist.
WATCHLIST: List[Dict[str, str]] = []

_cache: Dict[str, Any] = {"a": None, "a_at": 0.0, "hk": None, "hk_at": 0.0, "macro": None, "macro_at": 0.0}
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


def fetch_a_raw_eastmoney(codes: List[Dict[str, str]]) -> Dict[str, Any]:
    fields = "f12,f14,f2,f3,f4,f17,f15,f16,f18,f5,f6,f8,f7"
    secids = ",".join(f"{market_prefix(x['code'])}.{x['code']}" for x in codes)
    params = urlencode({"fltt": "2", "invt": "2", "fields": fields, "secids": secids})
    req = Request(f"https://push2.eastmoney.com/api/qt/ulist.np/get?{params}", headers={"User-Agent": "Mozilla/5.0", "Referer": "https://quote.eastmoney.com/"})
    with urlopen(req, timeout=12) as res:
        return json.loads(res.read().decode("utf-8"))


def tencent_market(code: str) -> str:
    return "sh" if code.startswith(("5", "6", "9")) else "sz"


def fetch_a_raw_tencent(codes: List[Dict[str, str]]) -> Dict[str, Any]:
    """Tencent qt.gtimg.cn fallback: reachable in more networks than EastMoney."""
    symbols = ",".join(f"{tencent_market(x['code'])}{x['code']}" for x in codes)
    req = Request(f"https://qt.gtimg.cn/q={symbols}", headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(req, timeout=12) as res:
        raw = res.read().decode("gbk", errors="replace")
    diff = []
    for line in raw.strip().split(";"):
        m = re.search(r'v_\w+="([^"]*)"', line)
        if not m:
            continue
        fields = m.group(1).split("~")
        if len(fields) < 35:
            continue
        price = safe_float(fields[3])
        previous = safe_float(fields[4])
        change_pct = round((price - previous) / previous * 100, 3) if price is not None and previous else None
        change = round(price - previous, 3) if price is not None and previous is not None else None
        diff.append({
            "f12": fields[2],
            "f14": fields[1],
            "f2": price,
            "f3": change_pct,
            "f4": change,
            "f17": safe_float(fields[5]),
            "f15": safe_float(fields[33]),
            "f16": safe_float(fields[34]),
            "f18": previous,
            "f5": safe_float(fields[6]),
            "f6": None,
            "f8": None,
            "f7": None,
        })
    return {"data": {"diff": diff}}


def fetch_a_raw(codes: List[Dict[str, str]]) -> Dict[str, Any]:
    try:
        return fetch_a_raw_eastmoney(codes)
    except Exception:
        return fetch_a_raw_tencent(codes)


def a_quote(row: Dict[str, Any], item: Dict[str, str]) -> Dict[str, Any]:
    return {"symbol": item["code"], "name": safe_str(row.get("f14")) or item["name"], "type": item["type"], "role": item.get("role", ""), "price": safe_float(row.get("f2")), "changePct": safe_float(row.get("f3")), "change": safe_float(row.get("f4")), "open": safe_float(row.get("f17")), "high": safe_float(row.get("f15")), "low": safe_float(row.get("f16")), "preClose": safe_float(row.get("f18")), "amount": safe_float(row.get("f6")), "volume": safe_float(row.get("f5")), "turnover": safe_float(row.get("f8")), "amplitude": safe_float(row.get("f7")), "sourceName": safe_str(row.get("f14"))}


def build_a(codes: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
    watch = codes if codes is not None else WATCHLIST
    if not watch:
        return {"status": "updated", "source": "EastMoney/Tencent lightweight quote endpoint via Python service", "updatedAt": f"{beijing_now()} 北京时间", "cacheSeconds": CACHE_SECONDS, "quoteCount": 0, "missingCount": 0, "missing": [], "watchlist": [], "quotes": [], "disclaimer": "尚未提供自选证券代码；可通过 /api/a/spot?symbols=600036,688008 指定。"}
    raw = fetch_a_raw(watch)
    diff = raw.get("data", {}).get("diff", []) if isinstance(raw, dict) else []
    rows = {safe_str(x.get("f12")): x for x in diff if isinstance(x, dict)}
    quotes = []
    missing = []
    for item in watch:
        row = rows.get(item["code"])
        if row:
            quotes.append(a_quote(row, item))
        else:
            missing.append(item)
            quotes.append({"symbol": item["code"], "name": item["name"], "type": item["type"], "role": item.get("role", ""), "price": None, "changePct": None, "change": None, "open": None, "high": None, "low": None, "preClose": None, "amount": None, "volume": None, "turnover": None, "amplitude": None, "sourceName": "", "error": "not_found"})
    return {"status": "updated", "source": "EastMoney/Tencent lightweight quote endpoint via Python service", "updatedAt": f"{beijing_now()} 北京时间", "cacheSeconds": CACHE_SECONDS, "quoteCount": len(quotes), "missingCount": len(missing), "missing": missing, "watchlist": watch, "quotes": quotes, "disclaimer": "东方财富/腾讯公开行情源，仅用于盘中观察，不作为唯一交易依据。"}


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


def macro_direction(value: Optional[float], previous: Optional[float]) -> str:
    if value is None or previous is None:
        return "unknown"
    if abs(value - previous) < 1e-9:
        return "flat"
    return "up" if value > previous else "down"


def build_macro() -> Dict[str, Any]:
    """PMI / CPI / PPI / Shibor from public AKShare endpoints (cache 1 hour)."""
    pmi = ak.macro_china_pmi()
    cpi = ak.macro_china_cpi()
    ppi = ak.macro_china_ppi()
    shibor = ak.rate_interbank(market="上海银行同业拆借市场", symbol="Shibor人民币", indicator="隔夜")

    def first_row(df, month_col):
        row = df.iloc[0]
        return {"period": safe_str(row.get(month_col)), "row": row}

    pmi_row = first_row(pmi, "月份")
    cpi_row = first_row(cpi, "月份")
    ppi_row = first_row(ppi, "月份")
    shibor_latest = shibor.iloc[-1]
    shibor_previous = shibor.iloc[-2] if len(shibor) > 1 else None

    def pmi_series(rows):
        return [safe_float(row.get("制造业-指数")) for _, row in rows.iterrows()][:2]

    pmi_values = pmi_series(pmi)
    cpi_values = [safe_float(cpi.iloc[0].get("全国-同比增长")), safe_float(cpi.iloc[1].get("全国-同比增长")) if len(cpi) > 1 else None]
    ppi_values = [safe_float(ppi.iloc[0].get("当月同比增长")), safe_float(ppi.iloc[1].get("当月同比增长")) if len(ppi) > 1 else None]
    shibor_values = [safe_float(shibor_latest.get("利率")), safe_float(shibor_previous.get("利率")) if shibor_previous is not None else None]

    macro = [
        {
            "id": "cn_pmi", "name": "中国制造业PMI", "value": pmi_values[0], "previous": pmi_values[1],
            "unit": "%", "period": safe_str(pmi_row["row"].get("月份")), "source": "AKShare/国家统计局",
            "note": "制造业PMI" + ("处于扩张区间" if (pmi_values[0] or 0) >= 50 else "仍处于收缩区间") if pmi_values[0] is not None else "",
        },
        {
            "id": "cn_cpi", "name": "中国CPI同比", "value": cpi_values[0], "previous": cpi_values[1],
            "unit": "%", "period": safe_str(cpi_row["row"].get("月份")), "source": "AKShare/国家统计局",
        },
        {
            "id": "cn_ppi", "name": "中国PPI同比", "value": ppi_values[0], "previous": ppi_values[1],
            "unit": "%", "period": safe_str(ppi_row["row"].get("月份")), "source": "AKShare/国家统计局",
        },
        {
            "id": "shibor_on", "name": "隔夜Shibor", "value": shibor_values[0], "previous": shibor_values[1],
            "unit": "%", "period": safe_str(shibor_latest.get("报告日")), "source": "AKShare/中国货币网",
        },
        {
            "id": "north_money", "name": "北向资金净流入", "value": None, "previous": None,
            "unit": "百万元", "period": "", "source": "交易所",
            "note": "北向资金日度净买入自2024年8月起停止披露，不再提供该指标。",
        },
    ]
    return {
        "status": "updated",
        "source": "AKShare 宏观数据（PMI/CPI/PPI/Shibor）",
        "updatedAt": f"{beijing_now()} 北京时间",
        "cacheSeconds": 3600,
        "macro": macro,
        "disclaimer": "宏观数据来自 AKShare 公开接口，月度数据以国家统计局为准。",
    }


@app.get("/api/a/macro")
def a_macro(force: bool = Query(default=False), x_service_token: Optional[str] = Header(default=None)):
    require_token(x_service_token)
    now = time.time()
    if not force and _cache["macro"] and now - float(_cache["macro_at"]) < 3600:
        data = dict(_cache["macro"])
        data["cacheHit"] = True
        data["servedAt"] = f"{beijing_now()} 北京时间"
        return JSONResponse(content=data)
    try:
        data = build_macro()
        data["cacheHit"] = False
        data["servedAt"] = f"{beijing_now()} 北京时间"
        _cache["macro"] = data
        _cache["macro_at"] = now
        return JSONResponse(content=data)
    except Exception as exc:
        return JSONResponse(status_code=500, content={"status": "failed", "source": "AKShare 宏观数据", "updatedAt": f"{beijing_now()} 北京时间", "error": str(exc), "macro": [], "disclaimer": "宏观接口失败时前端应保持既有降级状态。"})


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"status": "ok", "service": "fei-stock-akshare-api", "mode": "a-share + hk + macro", "time": f"{beijing_now()} 北京时间", "cacheSeconds": CACHE_SECONDS, "watchlistCount": len(WATCHLIST), "hkEndpoint": "/api/hk/spot", "macroEndpoint": "/api/a/macro"}


@app.get("/api/a/watchlist")
def get_watchlist(x_service_token: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_token(x_service_token)
    return {"status": "ok", "count": len(WATCHLIST), "watchlist": WATCHLIST}


@app.get("/api/a/spot")
def a_spot(force: bool = Query(default=False), symbols: str = Query(default=""), x_service_token: Optional[str] = Header(default=None)):
    require_token(x_service_token)
    watch = [{"code": s.strip(), "name": s.strip(), "type": "stock"} for s in symbols.split(",") if s.strip()]
    cache_key = ",".join(sorted(x["code"] for x in watch)) if watch else "default"
    now = time.time()
    if not force and _cache["a"] and _cache["a"].get("key") == cache_key and now - float(_cache["a_at"]) < CACHE_SECONDS:
        data = dict(_cache["a"])
        data.pop("key", None)
        data["cacheHit"] = True
        data["servedAt"] = f"{beijing_now()} 北京时间"
        return JSONResponse(content=data)
    try:
        data = build_a(watch)
        data["cacheHit"] = False
        data["servedAt"] = f"{beijing_now()} 北京时间"
        _cache["a"] = {**data, "key": cache_key}
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
