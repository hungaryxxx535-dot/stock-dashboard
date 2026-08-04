from __future__ import annotations

import hashlib
import json
import math
import random
import uuid
from dataclasses import asdict
from datetime import date, datetime, time
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from hermes_quant.data.akshare_provider import configure_http_environment
from hermes_quant.data.market_rules import PriceLimitRuleResolver
from hermes_quant.data.repository import QuantRepository
from hermes_quant.paper.models import FeeSchedule, MarketBar, OrderStatus, Side
from hermes_quant.risk import RiskLimits

from .engine import BacktestConfig, BacktestResult, BacktestSignal, EventDrivenBacktester


SHANGHAI = ZoneInfo("Asia/Shanghai")
MODEL_VERSION = "momentum-60d-rebalance-20d-v1"
RANDOM_SEED = 20260803
STOCK_POOL = ("600036", "600519", "000333", "300750", "601318")


def _json_ready(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_ready(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_ready(item) for item in value]
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if hasattr(value, "value"):
        return _json_ready(value.value)
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def _load_history(repository: QuantRepository) -> tuple[dict[str, list[dict[str, Any]]], str]:
    history: dict[str, list[dict[str, Any]]] = {}
    versions: set[str] = set()
    with repository.session() as connection:
        rows = connection.execute(
            """
            WITH ranked AS (
                SELECT d.*, ROW_NUMBER() OVER(
                    PARTITION BY symbol,trade_date
                    ORDER BY CASE WHEN source='akshare:stock_zh_a_daily' THEN 0 ELSE 1 END, fetched_at DESC
                ) AS rank
                FROM daily_bars d
                WHERE symbol IN (?,?,?,?,?)
            )
            SELECT * FROM ranked WHERE rank=1 ORDER BY trade_date,symbol
            """,
            STOCK_POOL,
        ).fetchall()
        for row in rows:
            item = dict(row)
            history.setdefault(item["symbol"], []).append(item)
            versions.add(str(item["data_version"]))
    if set(history) != set(STOCK_POOL):
        raise RuntimeError("real baseline requires all five configured symbols")
    version = "daily-bars:" + hashlib.sha256("|".join(sorted(versions)).encode("utf-8")).hexdigest()[:16]
    return history, version


def _common_dates(history: dict[str, list[dict[str, Any]]]) -> list[date]:
    sets = [{date.fromisoformat(row["trade_date"]) for row in rows} for rows in history.values()]
    return sorted(set.intersection(*sets))


def _price_map(history: dict[str, list[dict[str, Any]]]) -> dict[str, dict[date, dict[str, Any]]]:
    return {
        symbol: {date.fromisoformat(row["trade_date"]): row for row in rows}
        for symbol, rows in history.items()
    }


def _market_bars(
    repository: QuantRepository,
    prices: dict[str, dict[date, dict[str, Any]]],
    dates: list[date],
) -> list[MarketBar]:
    resolver = PriceLimitRuleResolver(repository)
    with repository.session() as connection:
        boards = {
            row["symbol"]: row["board"]
            for row in connection.execute(
                "SELECT symbol,board FROM securities_master WHERE symbol IN (?,?,?,?,?) GROUP BY symbol",
                STOCK_POOL,
            )
        }
    bars: list[MarketBar] = []
    for symbol in STOCK_POOL:
        previous_close: float | None = None
        for trade_date in dates:
            row = prices[symbol][trade_date]
            rule = resolver.resolve(boards.get(symbol, "MAIN"), trade_date)
            limit_up = round(previous_close * (1 + rule.limit_up_pct), 2) if previous_close and rule and rule.limit_up_pct is not None else None
            limit_down = round(previous_close * (1 + rule.limit_down_pct), 2) if previous_close and rule and rule.limit_down_pct is not None else None
            bars.append(
                MarketBar(
                    symbol=symbol,
                    timestamp=datetime.combine(trade_date, time(15), SHANGHAI),
                    trade_date=trade_date,
                    open=float(row["open"]),
                    high=float(row["high"]),
                    low=float(row["low"]),
                    close=float(row["close"]),
                    volume=int(float(row["volume"])),
                    suspended=float(row["volume"]) <= 0,
                    limit_up=limit_up,
                    limit_down=limit_down,
                    data_received_at=datetime.fromisoformat(str(row["fetched_at"])),
                )
            )
            previous_close = float(row["close"])
    return bars


def _quantity(price: float, initial_cash: float = 1_000_000.0) -> int:
    return max(100, int(initial_cash * 0.15 / price / 100) * 100)


def _rotation_signals(
    prices: dict[str, dict[date, dict[str, Any]]],
    all_dates: list[date],
    segment_dates: list[date],
    *,
    mode: str,
) -> list[BacktestSignal]:
    if len(segment_dates) < 4:
        return []
    date_index = {value: index for index, value in enumerate(all_dates)}
    randomizer = random.Random(RANDOM_SEED)
    signals: list[BacktestSignal] = []
    held_symbol: str | None = None
    held_quantity = 0
    rebalances = segment_dates[:-2:20]
    for signal_date in rebalances:
        index = date_index[signal_date]
        if index < 60:
            continue
        if mode == "momentum":
            scores = {
                symbol: float(prices[symbol][signal_date]["close"])
                / float(prices[symbol][all_dates[index - 60]]["close"])
                - 1
                for symbol in STOCK_POOL
            }
            selected = max(scores, key=lambda symbol: (scores[symbol], symbol))
            strategy_id = "momentum_baseline"
            model_version = MODEL_VERSION
        elif mode == "random":
            selected = randomizer.choice(STOCK_POOL)
            strategy_id = "random_baseline"
            model_version = f"random-fixed-seed-{RANDOM_SEED}"
        else:
            raise ValueError(f"unsupported rotation mode: {mode}")
        stamp = datetime.combine(signal_date, time(15), SHANGHAI)
        if selected == held_symbol:
            continue
        if held_symbol:
            close = float(prices[held_symbol][signal_date]["close"])
            signals.append(BacktestSignal(strategy_id, model_version, held_symbol, Side.SELL, stamp, held_quantity, round(close * 0.97, 2)))
        close = float(prices[selected][signal_date]["close"])
        held_symbol = selected
        held_quantity = _quantity(close)
        signals.append(BacktestSignal(strategy_id, model_version, selected, Side.BUY, stamp, held_quantity, round(close * 1.03, 2)))
    if held_symbol:
        signal_date = segment_dates[-2]
        close = float(prices[held_symbol][signal_date]["close"])
        signals.append(
            BacktestSignal(
                "momentum_baseline" if mode == "momentum" else "random_baseline",
                MODEL_VERSION if mode == "momentum" else f"random-fixed-seed-{RANDOM_SEED}",
                held_symbol,
                Side.SELL,
                datetime.combine(signal_date, time(15), SHANGHAI),
                held_quantity,
                round(close * 0.97, 2),
            )
        )
    return signals


def _equal_weight_signals(
    prices: dict[str, dict[date, dict[str, Any]]], segment_dates: list[date]
) -> list[BacktestSignal]:
    buy_date, sell_date = segment_dates[0], segment_dates[-2]
    signals: list[BacktestSignal] = []
    for symbol in STOCK_POOL:
        buy_close = float(prices[symbol][buy_date]["close"])
        quantity = _quantity(buy_close)
        signals.append(
            BacktestSignal(
                "equal_weight_baseline",
                "equal-weight-buy-hold-v1",
                symbol,
                Side.BUY,
                datetime.combine(buy_date, time(15), SHANGHAI),
                quantity,
                round(buy_close * 1.03, 2),
                industry=f"BENCHMARK_{symbol}",
            )
        )
        sell_close = float(prices[symbol][sell_date]["close"])
        signals.append(
            BacktestSignal(
                "equal_weight_baseline",
                "equal-weight-buy-hold-v1",
                symbol,
                Side.SELL,
                datetime.combine(sell_date, time(15), SHANGHAI),
                quantity,
                round(sell_close * 0.97, 2),
                industry=f"BENCHMARK_{symbol}",
            )
        )
    return signals


def _run(
    bars: list[MarketBar], signals: list[BacktestSignal], data_version: str
) -> BacktestResult:
    config = BacktestConfig(
        initial_cash=1_000_000.0,
        fees=FeeSchedule(
            commission_rate=0.0003,
            minimum_commission=5.0,
            stamp_tax_rate_on_sell=0.0005,
            slippage_bps=5.0,
            impact_bps_at_full_participation=20.0,
            max_volume_participation=0.10,
        ),
        data_version=data_version,
        random_seed=RANDOM_SEED,
        precision_grade="DAILY_APPROXIMATION",
        risk_limits=RiskLimits(0.80, 0.20, 0.80, 0.50),
    )
    return EventDrivenBacktester(config).run(bars, signals)


def _index_return(start: date, end: date) -> dict[str, Any]:
    configure_http_environment(None)
    import akshare as ak

    frame = ak.stock_zh_index_daily(symbol="sh000300")
    frame = frame.assign(_trade_date=frame["date"].map(lambda value: date.fromisoformat(str(value)[:10])))
    rows = frame[(frame["_trade_date"] >= start) & (frame["_trade_date"] <= end)].copy()
    if len(rows) < 2:
        raise RuntimeError("CSI 300 benchmark returned insufficient real observations")
    first = rows.iloc[0]
    last = rows.iloc[-1]
    payload = [
        (str(row["date"]), float(row["close"]))
        for _, row in rows.iterrows()
    ]
    return {
        "symbol": "sh000300",
        "source": "akshare:stock_zh_index_daily",
        "observations": len(rows),
        "start": str(first["_trade_date"]),
        "end": str(last["_trade_date"]),
        "price_return": float(last["close"]) / float(first["close"]) - 1,
        "data_version": "csi300:" + hashlib.sha256(json.dumps(payload).encode("utf-8")).hexdigest()[:16],
        "costs_included": False,
    }


def run_real_baseline(repository: QuantRepository, output_root: Path) -> dict[str, Any]:
    history, data_version = _load_history(repository)
    prices = _price_map(history)
    dates = _common_dates(history)
    if len(dates) < 400:
        raise RuntimeError("insufficient common real trading dates for train/validation/test")
    train_end = int(len(dates) * 0.50)
    validation_end = int(len(dates) * 0.70)
    train_dates = dates[:train_end]
    validation_dates = dates[train_end:validation_end]
    test_dates = dates[validation_end:]
    test_bars = _market_bars(repository, prices, test_dates)
    strategy_signals = _rotation_signals(prices, dates, test_dates, mode="momentum")
    random_signals = _rotation_signals(prices, dates, test_dates, mode="random")
    equal_signals = _equal_weight_signals(prices, test_dates)
    strategy = _run(test_bars, strategy_signals, data_version)
    random_result = _run(test_bars, random_signals, data_version)
    equal_result = _run(test_bars, equal_signals, data_version)
    index_result = _index_return(test_dates[0], test_dates[-1])
    run_id = str(uuid.uuid4())
    output_dir = output_root / run_id
    output_dir.mkdir(parents=True, exist_ok=False)
    split = {
        "training": {"start": train_dates[0], "end": train_dates[-1], "trading_days": len(train_dates)},
        "validation": {"start": validation_dates[0], "end": validation_dates[-1], "trading_days": len(validation_dates)},
        "test": {"start": test_dates[0], "end": test_dates[-1], "trading_days": len(test_dates)},
    }
    comparisons = {
        "strategy": asdict(strategy.metrics),
        "equal_weight": asdict(equal_result.metrics),
        "random_fixed_seed": asdict(random_result.metrics),
        "csi300_price_index": index_result,
    }
    summary = {
        "run_id": run_id,
        "created_at": datetime.now(SHANGHAI),
        "real_data": True,
        "uses_test_fixture": False,
        "stock_pool": list(STOCK_POOL),
        "split": split,
        "model_version": MODEL_VERSION,
        "strategy": {
            "name": "cross-sectional 60-trading-day momentum",
            "rebalance_trading_days": 20,
            "target_position_pct": 0.15,
            "next_bar_execution": True,
            "buy_limit_buffer_pct": 0.03,
            "sell_limit_buffer_pct": 0.03,
            "parameter_tuning_performed": False,
        },
        "execution": {
            "precision": "daily approximation",
            "t_plus_one": True,
            "suspension_and_zero_volume": True,
            "one_price_limit_up_down": True,
            "fees": _json_ready(asdict(strategy.config.fees)),
        },
        "data_version": data_version,
        "results": comparisons,
        "credibility": {
            "strategy_effectiveness_claimed": False,
            "credible_for_production": False,
            "reason": "Five-stock research universe, daily-bar execution approximation, no historical point-in-time index membership, and too few closed trades for statistical inference.",
        },
    }
    files = {
        "summary.json": summary,
        "trades.json": [asdict(item) for item in strategy.trades],
        "orders.json": [asdict(item) for item in strategy.orders],
        "unfilled_signals.json": [
            asdict(item) for item in strategy.orders if item.status != OrderStatus.FILLED
        ],
        "signals.json": [asdict(item) for item in strategy_signals],
        "benchmarks.json": {
            "equal_weight": asdict(equal_result.metrics),
            "random_fixed_seed": asdict(random_result.metrics),
            "csi300_price_index": index_result,
        },
    }
    for filename, payload in files.items():
        (output_dir / filename).write_text(
            json.dumps(_json_ready(payload), ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )
    public_summary = _json_ready(summary)
    public_summary["artifact_directory"] = str(output_dir)
    return public_summary
