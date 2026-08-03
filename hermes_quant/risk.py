from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RiskLimits:
    max_total_position_pct: float = 0.80
    max_single_position_pct: float = 0.20
    max_industry_position_pct: float = 0.35
    weak_regime_position_pct: float = 0.50


@dataclass(frozen=True)
class RiskContext:
    total_equity: float
    total_market_value: float
    symbol_market_value: float
    industry_market_value: float
    proposed_order_value: float
    market_regime: str


class RiskManager:
    def __init__(self, limits: RiskLimits | None = None) -> None:
        self.limits = limits or RiskLimits()

    def validate_buy(self, context: RiskContext) -> str | None:
        if context.total_equity <= 0:
            return "NON_POSITIVE_EQUITY"
        regime_limit = self.limits.weak_regime_position_pct if context.market_regime.lower() in {"weak", "risk_off", "bear"} else self.limits.max_total_position_pct
        if (context.total_market_value + context.proposed_order_value) / context.total_equity > regime_limit + 1e-12:
            return "TOTAL_OR_REGIME_POSITION_LIMIT"
        if (context.symbol_market_value + context.proposed_order_value) / context.total_equity > self.limits.max_single_position_pct + 1e-12:
            return "SINGLE_POSITION_LIMIT"
        if (context.industry_market_value + context.proposed_order_value) / context.total_equity > self.limits.max_industry_position_pct + 1e-12:
            return "INDUSTRY_CONCENTRATION_LIMIT"
        return None

