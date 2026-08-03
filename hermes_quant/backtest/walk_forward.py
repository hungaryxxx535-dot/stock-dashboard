from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class WalkForwardSplit:
    train: tuple[date, ...]
    validation: tuple[date, ...]
    out_of_sample: tuple[date, ...]
    final_holdout: tuple[date, ...]


def build_walk_forward_splits(dates: list[date], train_size: int, validation_size: int, step_size: int, final_holdout_size: int) -> list[WalkForwardSplit]:
    ordered = sorted(set(dates))
    if min(train_size, validation_size, step_size, final_holdout_size) <= 0:
        raise ValueError("all split sizes must be positive")
    if len(ordered) < train_size + validation_size + step_size + final_holdout_size:
        raise ValueError("insufficient dates for walk-forward and untouched holdout")
    holdout = tuple(ordered[-final_holdout_size:])
    development = ordered[:-final_holdout_size]
    splits: list[WalkForwardSplit] = []
    cursor = train_size
    while cursor + validation_size + step_size <= len(development):
        train = tuple(development[:cursor])
        validation = tuple(development[cursor:cursor + validation_size])
        oos = tuple(development[cursor + validation_size:cursor + validation_size + step_size])
        splits.append(WalkForwardSplit(train, validation, oos, holdout))
        cursor += step_size
    return splits

