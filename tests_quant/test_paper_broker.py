from __future__ import annotations

import unittest
from datetime import date, datetime, timedelta, timezone

from hermes_quant.paper.accounts import create_isolated_accounts
from hermes_quant.paper.broker import PaperBroker
from hermes_quant.paper.models import FeeSchedule, MarketBar, Order, OrderStatus, OrderType, Side


NOW = datetime(2024, 1, 2, 7, tzinfo=timezone.utc)


def order(side=Side.BUY, quantity=1000, limit=10.0, signal_time=NOW, submit_time=None) -> Order:
    return Order("A", "model-v1", "600001", side, OrderType.LIMIT, signal_time, submit_time or signal_time, quantity, limit)


def bar(**changes) -> MarketBar:
    values = dict(symbol="600001", timestamp=NOW + timedelta(days=1), trade_date=date(2024, 1, 3), open=9.9, high=10.2, low=9.8, close=10.0, volume=100_000)
    values.update(changes)
    return MarketBar(**values)


class PaperBrokerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fees = FeeSchedule(commission_rate=0.0003, minimum_commission=5, stamp_tax_rate_on_sell=0.0005, slippage_bps=0, impact_bps_at_full_participation=0, max_volume_participation=0.1)
        self.broker = PaperBroker(100_000, self.fees)

    def test_order_state_machine_and_cash_freeze(self) -> None:
        candidate = self.broker.submit(order())
        self.assertEqual(candidate.status, OrderStatus.ACCEPTED)
        self.assertGreater(self.broker.frozen_cash, 10_000)
        filled = self.broker.process_bar(candidate.order_id, bar())
        self.assertEqual(filled.status, OrderStatus.FILLED)
        self.assertEqual(filled.average_fill_price, 9.9)
        self.assertEqual(self.broker.frozen_cash, 0)
        self.assertEqual(self.broker.positions["600001"].pending_t1_quantity, 1000)

    def test_same_signal_bar_cannot_fill(self) -> None:
        candidate = self.broker.submit(order())
        same = bar(timestamp=NOW)
        self.assertEqual(self.broker.process_bar(candidate.order_id, same).status, OrderStatus.ACCEPTED)

    def test_t1_rejects_same_day_sell_then_allows_after_settlement(self) -> None:
        buy = self.broker.submit(order())
        self.broker.process_bar(buy.order_id, bar())
        rejected = self.broker.submit(order(side=Side.SELL, signal_time=NOW + timedelta(days=1), submit_time=NOW + timedelta(days=1)))
        self.assertEqual(rejected.status, OrderStatus.REJECTED)
        self.assertEqual(rejected.rejection_reason, "T1_OR_POSITION_LIMIT")
        self.broker.settle(date(2024, 1, 4))
        accepted = self.broker.submit(order(side=Side.SELL, signal_time=NOW + timedelta(days=2), submit_time=NOW + timedelta(days=2)))
        self.assertEqual(accepted.status, OrderStatus.ACCEPTED)

    def test_partial_fill_obeys_volume_participation(self) -> None:
        candidate = self.broker.submit(order(quantity=5000))
        result = self.broker.process_bar(candidate.order_id, bar(volume=10_000))
        self.assertEqual(result.status, OrderStatus.PARTIALLY_FILLED)
        self.assertEqual(result.filled_quantity, 1000)

    def test_suspended_and_one_price_limit_up_do_not_fill(self) -> None:
        suspended = self.broker.submit(order())
        self.assertEqual(self.broker.process_bar(suspended.order_id, bar(suspended=True)).status, OrderStatus.ACCEPTED)
        self.broker.cancel(suspended.order_id)
        limit_order = self.broker.submit(order())
        locked = bar(open=10, high=10, low=10, close=10, limit_up=10)
        self.assertEqual(self.broker.process_bar(limit_order.order_id, locked).status, OrderStatus.ACCEPTED)

    def test_insufficient_cash_minimum_commission_and_cancel_release(self) -> None:
        small = PaperBroker(1_000, self.fees)
        rejected = small.submit(order(quantity=1000))
        self.assertEqual(rejected.rejection_reason, "INSUFFICIENT_CASH")
        candidate = self.broker.submit(order(quantity=100))
        self.broker.process_bar(candidate.order_id, bar())
        self.assertEqual(candidate.commission, 5)
        pending = self.broker.submit(Order("A", "v1", "600002", Side.BUY, OrderType.LIMIT, NOW, NOW, 100, 10))
        self.assertGreater(self.broker.frozen_cash, 0)
        self.broker.cancel(pending.order_id)
        self.assertEqual(pending.status, OrderStatus.CANCELLED)
        self.assertEqual(self.broker.frozen_cash, 0)

    def test_five_accounts_are_isolated_with_identical_cost_model(self) -> None:
        accounts = create_isolated_accounts(100_000, self.fees)
        self.assertEqual(set(accounts), {"champion", "equal_weight", "random", "benchmark", "challenger"})
        accounts["champion"].submit(order())
        self.assertEqual(len(accounts["random"].orders), 0)
        self.assertTrue(all(account.initial_cash == 100_000 and account.fees == self.fees for account in accounts.values()))


if __name__ == "__main__":
    unittest.main()
