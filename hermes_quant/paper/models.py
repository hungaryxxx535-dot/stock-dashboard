from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum


class OrderStatus(str, Enum):
    CREATED = "CREATED"
    SUBMITTED = "SUBMITTED"
    ACCEPTED = "ACCEPTED"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


class Side(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"


@dataclass(frozen=True)
class FeeSchedule:
    commission_rate: float = 0.0003
    minimum_commission: float = 5.0
    stamp_tax_rate_on_sell: float = 0.0005
    slippage_bps: float = 5.0
    impact_bps_at_full_participation: float = 20.0
    lot_size: int = 100
    max_volume_participation: float = 0.10


@dataclass
class Order:
    strategy_id: str
    model_version: str
    symbol: str
    side: Side
    order_type: OrderType
    signal_time: datetime
    submit_time: datetime
    requested_quantity: int
    limit_price: float | None = None
    order_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    status: OrderStatus = OrderStatus.CREATED
    filled_quantity: int = 0
    average_fill_price: float = 0.0
    remaining_quantity: int = 0
    commission: float = 0.0
    tax: float = 0.0
    slippage: float = 0.0
    rejection_reason: str | None = None
    last_block_reason: str | None = None
    data_timestamp: datetime | None = None
    frozen_cash: float = 0.0

    def __post_init__(self) -> None:
        self.remaining_quantity = self.requested_quantity - self.filled_quantity


@dataclass(frozen=True)
class MarketBar:
    symbol: str
    timestamp: datetime
    trade_date: date
    open: float
    high: float
    low: float
    close: float
    volume: int
    suspended: bool = False
    limit_up: float | None = None
    limit_down: float | None = None
    data_received_at: datetime | None = None

    @property
    def one_price(self) -> bool:
        return self.open == self.high == self.low == self.close


@dataclass
class Position:
    symbol: str
    quantity: int = 0
    sellable_quantity: int = 0
    pending_t1_quantity: int = 0
    average_cost: float = 0.0


@dataclass(frozen=True)
class Fill:
    order_id: str
    symbol: str
    side: Side
    timestamp: datetime
    quantity: int
    price: float
    commission: float
    tax: float
    slippage_cost: float
    impact_cost: float
    data_timestamp: datetime
