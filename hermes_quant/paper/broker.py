from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from math import floor

from .models import FeeSchedule, Fill, MarketBar, Order, OrderStatus, OrderType, Position, Side


TERMINAL = {OrderStatus.FILLED, OrderStatus.CANCELLED, OrderStatus.REJECTED, OrderStatus.EXPIRED}


@dataclass(frozen=True)
class AccountSnapshot:
    cash: float
    frozen_cash: float
    market_value: float
    total_equity: float


class PaperBroker:
    """A-share paper broker. It has no network or real-broker integration."""

    def __init__(self, initial_cash: float, fees: FeeSchedule | None = None) -> None:
        if initial_cash <= 0:
            raise ValueError("initial_cash must be positive")
        self.initial_cash = float(initial_cash)
        self.cash = float(initial_cash)
        self.frozen_cash = 0.0
        self.fees = fees or FeeSchedule()
        self.orders: dict[str, Order] = {}
        self.fills: list[Fill] = []
        self.positions: dict[str, Position] = {}
        self.last_prices: dict[str, float] = {}
        self.current_trade_date: date | None = None

    @property
    def available_cash(self) -> float:
        return self.cash - self.frozen_cash

    def submit(self, order: Order, external_rejection: str | None = None) -> Order:
        if order.order_id in self.orders:
            return self.orders[order.order_id]
        order.status = OrderStatus.SUBMITTED
        self.orders[order.order_id] = order
        if external_rejection:
            order.status = OrderStatus.REJECTED
            order.rejection_reason = external_rejection
            return order
        reason = self._validate(order)
        if reason:
            order.status = OrderStatus.REJECTED
            order.rejection_reason = reason
            return order
        if order.side == Side.BUY:
            reference = order.limit_price
            if reference is None or reference <= 0:
                order.status = OrderStatus.REJECTED
                order.rejection_reason = "MARKET_BUY_REQUIRES_REFERENCE_LIMIT"
                return order
            estimated = reference * order.requested_quantity
            frozen = estimated + max(estimated * self.fees.commission_rate, self.fees.minimum_commission)
            if frozen > self.available_cash + 1e-9:
                order.status = OrderStatus.REJECTED
                order.rejection_reason = "INSUFFICIENT_CASH"
                return order
            order.frozen_cash = frozen
            self.frozen_cash += frozen
        order.status = OrderStatus.ACCEPTED
        return order

    def _validate(self, order: Order) -> str | None:
        if order.requested_quantity <= 0:
            return "INVALID_QUANTITY"
        if order.requested_quantity % self.fees.lot_size != 0:
            return "INVALID_LOT_SIZE"
        if order.submit_time < order.signal_time:
            return "SUBMIT_BEFORE_SIGNAL"
        if order.side == Side.SELL:
            position = self.positions.get(order.symbol)
            if not position or position.sellable_quantity < order.requested_quantity:
                return "T1_OR_POSITION_LIMIT"
        return None

    def process_bar(self, order_id: str, bar: MarketBar) -> Order:
        order = self.orders[order_id]
        if order.status in TERMINAL:
            return order
        self.last_prices[bar.symbol] = bar.close
        order.data_timestamp = bar.timestamp
        if bar.symbol != order.symbol or bar.timestamp <= order.signal_time or bar.timestamp < order.submit_time:
            return order
        if bar.suspended or bar.volume <= 0:
            return order
        if order.side == Side.BUY and bar.one_price and bar.limit_up is not None and bar.close >= bar.limit_up:
            return order
        if order.side == Side.SELL and bar.one_price and bar.limit_down is not None and bar.close <= bar.limit_down:
            return order
        raw_price = self._executable_price(order, bar)
        if raw_price is None:
            return order
        max_quantity = floor(bar.volume * self.fees.max_volume_participation / self.fees.lot_size) * self.fees.lot_size
        fill_quantity = min(order.remaining_quantity, max_quantity)
        if fill_quantity <= 0:
            return order
        participation = fill_quantity / bar.volume
        direction = 1.0 if order.side == Side.BUY else -1.0
        slippage_rate = self.fees.slippage_bps / 10_000
        impact_rate = self.fees.impact_bps_at_full_participation / 10_000 * min(1.0, participation / max(self.fees.max_volume_participation, 1e-9))
        fill_price = raw_price * (1 + direction * (slippage_rate + impact_rate))
        if order.order_type == OrderType.LIMIT and order.limit_price is not None:
            if order.side == Side.BUY and fill_price > order.limit_price:
                fill_price = order.limit_price
            if order.side == Side.SELL and fill_price < order.limit_price:
                fill_price = order.limit_price
        gross = fill_price * fill_quantity
        commission = max(gross * self.fees.commission_rate, self.fees.minimum_commission)
        tax = gross * self.fees.stamp_tax_rate_on_sell if order.side == Side.SELL else 0.0
        slippage_cost = abs(fill_price - raw_price) * fill_quantity
        impact_cost = raw_price * impact_rate * fill_quantity
        self._apply_fill(order, fill_quantity, fill_price, commission, tax)
        fill = Fill(order.order_id, order.symbol, order.side, bar.timestamp, fill_quantity, fill_price, commission, tax, slippage_cost, impact_cost, bar.timestamp)
        self.fills.append(fill)
        order.commission += commission
        order.tax += tax
        order.slippage += slippage_cost
        previous_value = order.average_fill_price * order.filled_quantity
        order.filled_quantity += fill_quantity
        order.remaining_quantity = order.requested_quantity - order.filled_quantity
        order.average_fill_price = (previous_value + fill_price * fill_quantity) / order.filled_quantity
        order.status = OrderStatus.FILLED if order.remaining_quantity == 0 else OrderStatus.PARTIALLY_FILLED
        if order.status == OrderStatus.FILLED:
            self._release_frozen(order)
        return order

    def _executable_price(self, order: Order, bar: MarketBar) -> float | None:
        if order.order_type == OrderType.MARKET:
            return bar.open
        assert order.limit_price is not None
        if order.side == Side.BUY:
            if bar.open > order.limit_price and bar.low > order.limit_price:
                return None
            return min(bar.open, order.limit_price)
        if bar.open < order.limit_price and bar.high < order.limit_price:
            return None
        return max(bar.open, order.limit_price)

    def _apply_fill(self, order: Order, quantity: int, price: float, commission: float, tax: float) -> None:
        position = self.positions.setdefault(order.symbol, Position(order.symbol))
        gross = quantity * price
        if order.side == Side.BUY:
            total_cost = position.average_cost * position.quantity + gross + commission
            self.cash -= gross + commission
            position.quantity += quantity
            position.pending_t1_quantity += quantity
            position.average_cost = total_cost / position.quantity
            used_frozen = min(order.frozen_cash, gross + commission)
            order.frozen_cash -= used_frozen
            self.frozen_cash -= used_frozen
        else:
            self.cash += gross - commission - tax
            position.quantity -= quantity
            position.sellable_quantity -= quantity
            if position.quantity == 0:
                position.average_cost = 0.0

    def _release_frozen(self, order: Order) -> None:
        if order.frozen_cash > 0:
            self.frozen_cash -= order.frozen_cash
            order.frozen_cash = 0.0

    def cancel(self, order_id: str) -> Order:
        order = self.orders[order_id]
        if order.status not in TERMINAL:
            self._release_frozen(order)
            order.status = OrderStatus.CANCELLED
        return order

    def expire(self, order_id: str) -> Order:
        order = self.orders[order_id]
        if order.status not in TERMINAL:
            self._release_frozen(order)
            order.status = OrderStatus.EXPIRED
        return order

    def settle(self, trade_date: date) -> None:
        if self.current_trade_date is not None and trade_date <= self.current_trade_date:
            return
        for position in self.positions.values():
            position.sellable_quantity += position.pending_t1_quantity
            position.pending_t1_quantity = 0
        self.current_trade_date = trade_date

    def snapshot(self) -> AccountSnapshot:
        market_value = sum(position.quantity * self.last_prices.get(symbol, position.average_cost) for symbol, position in self.positions.items())
        return AccountSnapshot(self.cash, self.frozen_cash, market_value, self.cash + market_value)
