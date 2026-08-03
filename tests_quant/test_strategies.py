from __future__ import annotations

import unittest
from datetime import date, datetime, timedelta, timezone

from hermes_quant.data.models import DailyBar
from hermes_quant.strategies.definitions import BASELINE_STRATEGIES, evaluate_baseline


class StrategyTests(unittest.TestCase):
    def test_five_strategies_have_independent_governance_fields(self) -> None:
        self.assertEqual(set(BASELINE_STRATEGIES), {"A", "B", "C", "D", "E"})
        versions = {(item.strategy_version, item.parameter_version) for item in BASELINE_STRATEGIES.values()}
        self.assertEqual(len(versions), 5)
        for item in BASELINE_STRATEGIES.values():
            for value in (item.market_regime, item.universe_rule, item.signal_rule, item.entry_rule, item.disable_rule):
                self.assertTrue(value)
            self.assertGreater(item.max_holding_days, 0)

    def test_evaluator_drops_future_bars(self) -> None:
        start = date(2024, 1, 1)
        bars = [DailyBar("600001", start + timedelta(days=index), 10, 10.5, 9.5, 10 + index * 0.01, 1000, 10_000) for index in range(25)]
        signal_time = datetime(2024, 1, 22, 15, tzinfo=timezone.utc)
        with_future = evaluate_baseline("A", "600001", bars, signal_time)
        without_future = evaluate_baseline("A", "600001", bars[:22], signal_time)
        self.assertEqual(with_future.score_components, without_future.score_components)
        self.assertEqual(with_future.eligible, without_future.eligible)

    def test_event_strategy_rejects_future_publication(self) -> None:
        start = date(2024, 1, 1)
        bars = [DailyBar("600001", start + timedelta(days=index), 10, 11, 9, 10 + index * 0.1, 1000 if index < 20 else 2000, 10_000) for index in range(22)]
        signal_time = datetime(2024, 1, 22, 15, tzinfo=timezone.utc)
        result = evaluate_baseline("C", "600001", bars, signal_time, event_published_at=signal_time + timedelta(minutes=1))
        self.assertFalse(result.eligible)
        self.assertEqual(result.score_components["event_known"], 0.0)


if __name__ == "__main__":
    unittest.main()
