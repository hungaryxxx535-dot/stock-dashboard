from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from statistics import fmean

from hermes_quant.data.models import DailyBar


@dataclass(frozen=True)
class StrategyDefinition:
    strategy_id: str
    name: str
    market_regime: str
    universe_rule: str
    signal_rule: str
    entry_rule: str
    max_chase_pct: float
    stop_loss_pct: float
    take_profit_pct: float
    time_stop_days: int
    max_holding_days: int
    disable_rule: str
    parameter_version: str
    strategy_version: str


@dataclass(frozen=True)
class StrategySignal:
    strategy_id: str
    symbol: str
    signal_time: datetime
    eligible: bool
    score_components: dict[str, float]
    reasons: tuple[str, ...]
    data_cutoff: datetime


BASELINE_STRATEGIES: dict[str, StrategyDefinition] = {
    "A": StrategyDefinition("A", "强势行业龙头缩量回踩", "指数在20日均线上且行业相对强度为正", "点时股票池、非风险警示、可交易、行业流动性前30%", "20日趋势向上，回踩10日均线且成交量低于20日均量70%", "信号后下一可交易K线，价格不高于信号收盘+2%", 2.0, 6.0, 12.0, 5, 15, "市场环境转弱、停牌或数据不完整", "A-p1", "A-v1"),
    "B": StrategyDefinition("B", "平台突破后确认", "中性或上行市场", "点时股票池、上市满120日、20日平均成交额达标", "20日平台上沿突破后回测不破且收盘重新转强", "确认日之后下一可交易K线，价格不高于突破位+3%", 3.0, 5.0, 10.0, 4, 12, "突破日一字涨停、确认量价失真", "B-p1", "B-v1"),
    "C": StrategyDefinition("C", "事件驱动后的价格延续", "非系统性急跌", "事件在信号时点已公开且证券可交易", "已知事件后两个交易日内放量上涨且未透支", "确认后下一可交易K线，价格不高于确认收盘+2%", 2.0, 7.0, 14.0, 3, 10, "事件撤回、未来公告、连续一字板", "C-p1", "C-v1"),
    "D": StrategyDefinition("D", "趋势股首次有效回撤", "上行或震荡偏强", "60日新高附近、点时行业强度为正", "首次回撤20日均线附近并出现止跌K线", "止跌确认后下一可交易K线", 2.0, 6.0, 12.0, 5, 15, "60日内已有有效回撤、趋势破坏", "D-p1", "D-v1"),
    "E": StrategyDefinition("E", "超跌修复", "恐慌缓和且指数不再创新低", "非退市整理、非风险警示、流动性达标", "10日跌幅显著且当日收盘重回5日均线", "修复确认后下一可交易K线", 1.5, 5.0, 8.0, 3, 8, "基本面退市风险、仍在连续跌停", "E-p1", "E-v1"),
}


def evaluate_baseline(strategy_id: str, symbol: str, history: list[DailyBar], signal_time: datetime, event_published_at: datetime | None = None) -> StrategySignal:
    """Evaluate only the supplied history; caller is responsible for PIT membership."""
    definition = BASELINE_STRATEGIES[strategy_id]
    bars = sorted([bar for bar in history if bar.trade_date <= signal_time.date()], key=lambda item: item.trade_date)
    if len(bars) < 20:
        return StrategySignal(strategy_id, symbol, signal_time, False, {"history": len(bars) / 20}, ("历史长度不足20日",), signal_time)
    closes = [bar.close for bar in bars]
    volumes = [bar.volume for bar in bars]
    last = bars[-1]
    ma5, ma10, ma20 = fmean(closes[-5:]), fmean(closes[-10:]), fmean(closes[-20:])
    volume_ratio = last.volume / fmean(volumes[-20:]) if fmean(volumes[-20:]) else 0.0
    trend = 1.0 if ma5 > ma10 > ma20 else 0.0
    scores = {"trend": trend, "volume_ratio": volume_ratio, "distance_ma10": (last.close / ma10 - 1.0), "distance_ma20": (last.close / ma20 - 1.0)}
    reasons: list[str] = []
    eligible = False
    if strategy_id == "A":
        eligible = trend == 1.0 and abs(last.close / ma10 - 1) <= 0.03 and volume_ratio <= 0.70
        reasons.append("趋势、10日线回踩和缩量同时满足" if eligible else "趋势/回踩/缩量条件未同时满足")
    elif strategy_id == "B":
        prior_high = max(closes[-20:-2])
        breakout = bars[-2].close > prior_high
        confirmed = last.low >= prior_high * 0.98 and last.close >= prior_high
        scores.update({"breakout": float(breakout), "confirmed": float(confirmed)})
        eligible = breakout and confirmed
        reasons.append("突破后确认" if eligible else "尚未完成突破确认")
    elif strategy_id == "C":
        event_known = event_published_at is not None and event_published_at <= signal_time
        two_day_return = last.close / bars[-3].close - 1
        eligible = event_known and 0.02 <= two_day_return <= 0.15 and volume_ratio >= 1.2
        scores.update({"event_known": float(event_known), "two_day_return": two_day_return})
        reasons.append("事件已公开且价格延续" if eligible else "事件时点或延续条件不满足")
    elif strategy_id == "D":
        near_high = last.close >= max(closes[-60:] if len(closes) >= 60 else closes) * 0.85
        pullback = abs(last.close / ma20 - 1) <= 0.03 and last.close > last.open
        eligible = near_high and pullback
        scores.update({"near_high": float(near_high), "pullback": float(pullback)})
        reasons.append("首次回撤需由调用方的历史信号状态进一步确认" if eligible else "趋势回撤条件未满足")
    elif strategy_id == "E":
        ten_day_return = last.close / bars[-11].close - 1
        repair = last.close > ma5 and last.close > last.open
        eligible = ten_day_return <= -0.12 and repair
        scores.update({"ten_day_return": ten_day_return, "repair": float(repair)})
        reasons.append("超跌后修复" if eligible else "超跌幅度或修复条件未满足")
    return StrategySignal(definition.strategy_id, symbol, signal_time, eligible, scores, tuple(reasons), signal_time)

