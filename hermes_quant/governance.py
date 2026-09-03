from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class PromotionStatus(str, Enum):
    BLOCKED = "BLOCKED"
    PAPER_OBSERVATION = "PAPER_OBSERVATION"
    PENDING_MANUAL_APPROVAL = "PENDING_MANUAL_APPROVAL"
    APPROVED = "APPROVED"


@dataclass(frozen=True)
class ModelEvidence:
    hypothesis_documented: bool
    historical_backtest_passed: bool
    walk_forward_passed: bool
    untouched_holdout_passed: bool
    parameter_stability_passed: bool
    cost_stress_passed: bool
    paper_trading_days: int
    champion_comparison_passed: bool
    manual_approval: bool = False


def promotion_status(evidence: ModelEvidence) -> PromotionStatus:
    prerequisites = (evidence.hypothesis_documented, evidence.historical_backtest_passed, evidence.walk_forward_passed, evidence.untouched_holdout_passed, evidence.parameter_stability_passed, evidence.cost_stress_passed)
    if not all(prerequisites):
        return PromotionStatus.BLOCKED
    if evidence.paper_trading_days < 20 or not evidence.champion_comparison_passed:
        return PromotionStatus.PAPER_OBSERVATION
    if not evidence.manual_approval:
        return PromotionStatus.PENDING_MANUAL_APPROVAL
    return PromotionStatus.APPROVED


def reliability_label(paper_trading_days: int) -> str:
    if paper_trading_days < 20:
        return "insufficient"
    if paper_trading_days < 60:
        return "initial"
    return "more_reliable"

