from __future__ import annotations

import unittest

from hermes_quant.governance import ModelEvidence, PromotionStatus, promotion_status, reliability_label
from hermes_quant.risk import RiskContext, RiskLimits, RiskManager


class RiskAndGovernanceTests(unittest.TestCase):
    def test_risk_manager_enforces_single_industry_and_regime_limits(self) -> None:
        manager = RiskManager(RiskLimits(0.8, 0.2, 0.35, 0.5))
        self.assertEqual(manager.validate_buy(RiskContext(100, 30, 15, 20, 10, "normal")), "SINGLE_POSITION_LIMIT")
        self.assertEqual(manager.validate_buy(RiskContext(100, 30, 0, 30, 10, "normal")), "INDUSTRY_CONCENTRATION_LIMIT")
        self.assertEqual(manager.validate_buy(RiskContext(100, 45, 0, 0, 10, "weak")), "TOTAL_OR_REGIME_POSITION_LIMIT")
        self.assertIsNone(manager.validate_buy(RiskContext(100, 30, 0, 10, 10, "normal")))

    def test_challenger_cannot_skip_elapsed_paper_days_or_manual_approval(self) -> None:
        base = dict(hypothesis_documented=True, historical_backtest_passed=True, walk_forward_passed=True, untouched_holdout_passed=True, parameter_stability_passed=True, cost_stress_passed=True, champion_comparison_passed=True)
        self.assertEqual(promotion_status(ModelEvidence(**base, paper_trading_days=19)), PromotionStatus.PAPER_OBSERVATION)
        self.assertEqual(promotion_status(ModelEvidence(**base, paper_trading_days=20)), PromotionStatus.PENDING_MANUAL_APPROVAL)
        self.assertEqual(promotion_status(ModelEvidence(**base, paper_trading_days=20, manual_approval=True)), PromotionStatus.APPROVED)
        self.assertEqual(reliability_label(59), "initial")
        self.assertEqual(reliability_label(60), "more_reliable")


if __name__ == "__main__":
    unittest.main()
