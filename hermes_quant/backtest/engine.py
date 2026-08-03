from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from hermes_quant.paper.broker import PaperBroker
from hermes_quant.paper.models import FeeSchedule, MarketBar, Order, OrderStatus, OrderType, Side
from hermes_quant.risk import RiskContext, RiskLimits, RiskManager

from .metrics import BacktestMetrics, ClosedTrade, calculate_metrics


@dataclass(frozen=True)
class BacktestSignal:
    strategy_id: str
    model_version: str
    symbol: str
    side: Side
    signal_time: datetime
    quantity: int
    limit_price: float
    industry: str = "UNKNOWN"
    market_regime: str = "normal"


@dataclass(frozen=True)
class BacktestConfig:
    initial_cash: float = 1_000_000.0
    fees: FeeSchedule = FeeSchedule()
    data_version: str = "fixture"
    random_seed: int = 20260803
    precision_grade: str = "DAILY_APPROXIMATION"
    risk_limits: RiskLimits = RiskLimits()


@dataclass(frozen=True)
class BacktestResult:
    config: BacktestConfig
    metrics: BacktestMetrics
    orders: tuple[Order, ...]
    trades: tuple[ClosedTrade, ...]
    equity_by_date: dict[date, float]
    warnings: tuple[str, ...]


class EventDrivenBacktester:
    def __init__(self, config: BacktestConfig | None = None) -> None:
        self.config = config or BacktestConfig()

    def run(self, bars: list[MarketBar], signals: list[BacktestSignal]) -> BacktestResult:
        broker = PaperBroker(self.config.initial_cash, self.config.fees)
        risk_manager = RiskManager(self.config.risk_limits)
        symbol_industries = {signal.symbol: signal.industry for signal in signals}
        ordered_bars = sorted(bars, key=lambda item: (item.timestamp, item.symbol))
        pending_signals = sorted(signals, key=lambda item: (item.signal_time, item.symbol, item.strategy_id))
        signal_index = 0
        active: list[str] = []
        equity_by_date: dict[date, float] = {}
        bars_by_symbol: dict[str, list[MarketBar]] = {}
        for bar in ordered_bars:
            bars_by_symbol.setdefault(bar.symbol, []).append(bar)
            if broker.current_trade_date != bar.trade_date:
                broker.settle(bar.trade_date)
            while signal_index < len(pending_signals) and pending_signals[signal_index].signal_time < bar.timestamp:
                signal = pending_signals[signal_index]
                candidate = Order(signal.strategy_id, signal.model_version, signal.symbol, signal.side, OrderType.LIMIT, signal.signal_time, signal.signal_time, signal.quantity, signal.limit_price)
                broker.submit(candidate, self._risk_rejection(broker, signal, symbol_industries, risk_manager))
                if candidate.status in {OrderStatus.ACCEPTED, OrderStatus.PARTIALLY_FILLED}:
                    active.append(candidate.order_id)
                signal_index += 1
            for order_id in list(active):
                order = broker.orders[order_id]
                if order.symbol != bar.symbol:
                    continue
                broker.process_bar(order_id, bar)
                if order.status in {OrderStatus.FILLED, OrderStatus.REJECTED, OrderStatus.CANCELLED, OrderStatus.EXPIRED}:
                    active.remove(order_id)
            equity_by_date[bar.trade_date] = broker.snapshot().total_equity
        while signal_index < len(pending_signals):
            signal = pending_signals[signal_index]
            candidate = Order(signal.strategy_id, signal.model_version, signal.symbol, signal.side, OrderType.LIMIT, signal.signal_time, signal.signal_time, signal.quantity, signal.limit_price)
            broker.submit(candidate, self._risk_rejection(broker, signal, symbol_industries, risk_manager))
            signal_index += 1
        for order_id in list(active):
            broker.expire(order_id)
        trades = self._closed_trades(broker, bars_by_symbol)
        unfilled = sum(order.status != OrderStatus.FILLED for order in broker.orders.values())
        metrics = calculate_metrics(self.config.initial_cash, equity_by_date, trades, len(broker.orders), unfilled, sum(fill.slippage_cost for fill in broker.fills), sum(fill.commission + fill.tax for fill in broker.fills))
        warnings = ("日线撮合仅代表下一可交易日开盘附近的保守近似，不具备分钟级精度。",) if self.config.precision_grade == "DAILY_APPROXIMATION" else ()
        return BacktestResult(self.config, metrics, tuple(broker.orders.values()), tuple(trades), equity_by_date, warnings)

    @staticmethod
    def _risk_rejection(broker: PaperBroker, signal: BacktestSignal, symbol_industries: dict[str, str], risk_manager: RiskManager) -> str | None:
        if signal.side != Side.BUY:
            return None
        snapshot = broker.snapshot()
        symbol_value = broker.positions.get(signal.symbol).quantity * broker.last_prices.get(signal.symbol, signal.limit_price) if signal.symbol in broker.positions else 0.0
        industry_value = 0.0
        for symbol, position in broker.positions.items():
            if symbol_industries.get(symbol, "UNKNOWN") == signal.industry:
                industry_value += position.quantity * broker.last_prices.get(symbol, position.average_cost)
        context = RiskContext(snapshot.total_equity, snapshot.market_value, symbol_value, industry_value, signal.limit_price * signal.quantity, signal.market_regime)
        return risk_manager.validate_buy(context)

    @staticmethod
    def _closed_trades(broker: PaperBroker, bars_by_symbol: dict[str, list[MarketBar]]) -> list[ClosedTrade]:
        queues: dict[str, list[dict[str, object]]] = {}
        trades: list[ClosedTrade] = []
        for fill in sorted(broker.fills, key=lambda item: item.timestamp):
            order = broker.orders[fill.order_id]
            if fill.side == Side.BUY:
                queues.setdefault(fill.symbol, []).append({"quantity": fill.quantity, "price": fill.price, "time": fill.timestamp, "commission": fill.commission, "strategy": order.strategy_id})
                continue
            remaining = fill.quantity
            sell_fee_per_share = (fill.commission + fill.tax) / fill.quantity
            queue = queues.setdefault(fill.symbol, [])
            while remaining > 0 and queue:
                lot = queue[0]
                matched = min(remaining, int(lot["quantity"]))
                buy_fee_per_share = float(lot["commission"]) / int(lot["quantity"])
                pnl = (fill.price - float(lot["price"]) - buy_fee_per_share - sell_fee_per_share) * matched
                entry_time = lot["time"]
                relevant = [bar for bar in bars_by_symbol.get(fill.symbol, []) if entry_time <= bar.timestamp <= fill.timestamp]
                mfe = (max(bar.high for bar in relevant) / float(lot["price"]) - 1) if relevant else None
                mae = (min(bar.low for bar in relevant) / float(lot["price"]) - 1) if relevant else None
                trades.append(ClosedTrade(fill.symbol, str(lot["strategy"]), entry_time, fill.timestamp, matched, float(lot["price"]), fill.price, pnl, max(0, (fill.timestamp.date() - entry_time.date()).days), mfe, mae))
                lot["quantity"] = int(lot["quantity"]) - matched
                remaining -= matched
                if int(lot["quantity"]) == 0:
                    queue.pop(0)
        return trades
