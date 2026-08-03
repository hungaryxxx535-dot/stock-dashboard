from __future__ import annotations

from dataclasses import dataclass

from .broker import PaperBroker
from .models import FeeSchedule


@dataclass(frozen=True)
class PaperAccountSpec:
    account_id: str
    name: str
    role: str
    model_version: str


DEFAULT_ACCOUNTS = (
    PaperAccountSpec("champion", "Hermes Champion", "主模型", "champion-v1"),
    PaperAccountSpec("equal_weight", "达标候选等权", "候选对照", "baseline-equal-v1"),
    PaperAccountSpec("random", "点时股票池随机", "随机对照", "baseline-random-v1"),
    PaperAccountSpec("benchmark", "指数与风格基准", "风格基准", "baseline-style-v1"),
    PaperAccountSpec("challenger", "Challenger", "实验模型", "challenger-v1"),
)


def create_isolated_accounts(initial_cash: float, fees: FeeSchedule) -> dict[str, PaperBroker]:
    return {spec.account_id: PaperBroker(initial_cash, fees) for spec in DEFAULT_ACCOUNTS}

