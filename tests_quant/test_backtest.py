from __future__ import annotations

import unittest
from datetime import date, datetime, timedelta, timezone

from hermes_quant.backtest.engine import BacktestConfig, BacktestSignal, EventDrivenBacktester
from hermes_quant.backtest.walk_forward import build_walk_forward_splits
from hermes_quant.paper.models import FeeSchedule, MarketBar, OrderStatus, Side
from hermes_quant.risk import RiskLimits


BASE = datetime(2024, 1, 1, 7, tzinfo=timezone.utc)


def market_bar(day: int, price: float, volume: int = 100_000) -> MarketBar:
    stamp = BASE + timedelta(days=day)
    return MarketBar("600001", stamp, stamp.date(), price, price * 1.02, price * 0.98, price, volume)


class BacktestTests(unittest.TestCase):
    def config(self) -> BacktestConfig:
        return BacktestConfig(100_000, FeeSchedule(slippage_bps=0, impact_bps_at_full_participation=0, max_volume_participation=0.1), "fixture-v1", 7)

    def test_next_bar_fill_t1_and_reproducibility(self) -> None:
        bars = [market_bar(1, 10), market_bar(2, 11), market_bar(3, 12), market_bar(4, 13)]
        signals = [
            BacktestSignal("A", "v1", "600001", Side.BUY, BASE, 1000, 10.5),
            BacktestSignal("A", "v1", "600001", Side.SELL, BASE + timedelta(days=2, hours=-1), 1000, 11.5),
        ]
        first = EventDrivenBacktester(self.config()).run(bars, signals)
        second = EventDrivenBacktester(self.config()).run(bars, signals)
        self.assertEqual(first.metrics, second.metrics)
        self.assertEqual(first.orders[0].average_fill_price, 10)
        self.assertEqual(first.orders[0].data_timestamp, bars[0].timestamp)
        self.assertEqual(first.metrics.total_trades, 1)
        self.assertGreater(first.metrics.cumulative_return, 0)

    def test_unfilled_signal_is_retained(self) -> None:
        bars = [market_bar(1, 12)]
        signals = [BacktestSignal("B", "v1", "600001", Side.BUY, BASE, 1000, 10)]
        result = EventDrivenBacktester(self.config()).run(bars, signals)
        self.assertEqual(result.orders[0].status, OrderStatus.EXPIRED)
        self.assertEqual(result.metrics.unfilled_rate, 1.0)

    def test_risk_limits_reject_concentrated_order_before_matching(self) -> None:
        config = BacktestConfig(100_000, FeeSchedule(slippage_bps=0, impact_bps_at_full_participation=0), "fixture-v1", 7, risk_limits=RiskLimits(0.8, 0.2, 0.35, 0.5))
        result = EventDrivenBacktester(config).run([market_bar(1, 10)], [BacktestSignal("A", "v1", "600001", Side.BUY, BASE, 3000, 10, "BANK", "normal")])
        self.assertEqual(result.orders[0].status, OrderStatus.REJECTED)
        self.assertEqual(result.orders[0].rejection_reason, "SINGLE_POSITION_LIMIT")

    def test_walk_forward_reserves_identical_untouched_holdout(self) -> None:
        dates = [date(2024, 1, 1) + timedelta(days=index) for index in range(140)]
        splits = build_walk_forward_splits(dates, 60, 20, 20, 20)
        self.assertEqual(len(splits), 2)
        self.assertEqual(splits[0].final_holdout, splits[1].final_holdout)
        for split in splits:
            self.assertTrue(set(split.train).isdisjoint(split.validation))
            self.assertTrue(set(split.validation).isdisjoint(split.out_of_sample))
            self.assertTrue(set(split.out_of_sample).isdisjoint(split.final_holdout))


if __name__ == "__main__":
    unittest.main()
