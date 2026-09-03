from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from math import prod, sqrt
from statistics import fmean, pstdev


@dataclass(frozen=True)
class ClosedTrade:
    symbol: str
    strategy_id: str
    entry_time: datetime
    exit_time: datetime
    quantity: int
    entry_price: float
    exit_price: float
    net_pnl: float
    holding_days: int
    mfe_pct: float | None
    mae_pct: float | None


@dataclass(frozen=True)
class BacktestMetrics:
    total_trades: int
    win_rate: float
    payoff_ratio: float | None
    profit_factor: float | None
    expectancy: float
    cumulative_return: float
    annualized_return: float | None
    max_drawdown: float
    sharpe: float | None
    sortino: float | None
    calmar: float | None
    max_consecutive_losses: int
    average_holding_days: float | None
    average_mfe_pct: float | None
    average_mae_pct: float | None
    unfilled_rate: float
    slippage_cost: float
    fee_cost: float
    strategy_performance: dict[str, dict[str, float]]
    regime_performance: dict[str, dict[str, float]]
    industry_performance: dict[str, dict[str, float]]
    return_concentration: float | None
    parameter_stability: dict[str, float]


def _max_drawdown(values: list[float]) -> float:
    peak = values[0]
    worst = 0.0
    for value in values:
        peak = max(peak, value)
        if peak:
            worst = min(worst, value / peak - 1)
    return worst


def _annualized(daily_returns: list[float]) -> float | None:
    if not daily_returns:
        return None
    return prod(1 + value for value in daily_returns) ** (252 / len(daily_returns)) - 1


def calculate_metrics(initial_cash: float, equity_by_date: dict[date, float], trades: list[ClosedTrade], submitted_orders: int, unfilled_orders: int, slippage_cost: float, fee_cost: float) -> BacktestMetrics:
    observed_equity = [equity_by_date[key] for key in sorted(equity_by_date)]
    ordered_equity = [initial_cash, *observed_equity] if observed_equity else [initial_cash]
    daily_returns = [ordered_equity[index] / ordered_equity[index - 1] - 1 for index in range(1, len(ordered_equity)) if ordered_equity[index - 1]]
    wins = [trade.net_pnl for trade in trades if trade.net_pnl > 0]
    losses = [trade.net_pnl for trade in trades if trade.net_pnl < 0]
    average_win = fmean(wins) if wins else 0.0
    average_loss = abs(fmean(losses)) if losses else 0.0
    profit_factor = sum(wins) / abs(sum(losses)) if losses else (None if not wins else float("inf"))
    payoff = average_win / average_loss if average_loss else (None if not wins else float("inf"))
    mean_return = fmean(daily_returns) if daily_returns else 0.0
    volatility = pstdev(daily_returns) if len(daily_returns) > 1 else 0.0
    downside = [value for value in daily_returns if value < 0]
    downside_deviation = sqrt(sum(value * value for value in downside) / len(downside)) if downside else 0.0
    annualized = _annualized(daily_returns)
    drawdown = _max_drawdown(ordered_equity)
    loss_streak = worst_streak = 0
    for trade in trades:
        loss_streak = loss_streak + 1 if trade.net_pnl < 0 else 0
        worst_streak = max(worst_streak, loss_streak)
    by_strategy: dict[str, list[float]] = {}
    for trade in trades:
        by_strategy.setdefault(trade.strategy_id, []).append(trade.net_pnl)
    strategy_performance = {key: {"trades": float(len(values)), "net_pnl": sum(values), "win_rate": sum(value > 0 for value in values) / len(values)} for key, values in by_strategy.items()}
    positive_total = sum(wins)
    concentration = sum(sorted(wins, reverse=True)[:5]) / positive_total if positive_total else None
    mfe = [trade.mfe_pct for trade in trades if trade.mfe_pct is not None]
    mae = [trade.mae_pct for trade in trades if trade.mae_pct is not None]
    return BacktestMetrics(
        total_trades=len(trades), win_rate=len(wins) / len(trades) if trades else 0.0,
        payoff_ratio=payoff, profit_factor=profit_factor, expectancy=fmean([trade.net_pnl for trade in trades]) if trades else 0.0,
        cumulative_return=ordered_equity[-1] / initial_cash - 1, annualized_return=annualized, max_drawdown=drawdown,
        sharpe=(mean_return / volatility * sqrt(252)) if volatility else None,
        sortino=(mean_return / downside_deviation * sqrt(252)) if downside_deviation else None,
        calmar=(annualized / abs(drawdown)) if annualized is not None and drawdown else None,
        max_consecutive_losses=worst_streak, average_holding_days=fmean([trade.holding_days for trade in trades]) if trades else None,
        average_mfe_pct=fmean(mfe) if mfe else None, average_mae_pct=fmean(mae) if mae else None,
        unfilled_rate=unfilled_orders / submitted_orders if submitted_orders else 0.0, slippage_cost=slippage_cost, fee_cost=fee_cost,
        strategy_performance=strategy_performance, regime_performance={}, industry_performance={}, return_concentration=concentration, parameter_stability={}
    )
