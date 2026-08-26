"""Convert validated model probabilities into deterministic research signals."""

from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class StrategyRule:
    threshold: float


class StrategyGenerator:
    def __init__(self, rule: StrategyRule) -> None:
        if not 0 <= rule.threshold <= 1:
            raise ValueError("threshold must be between 0 and 1")
        self.rule = rule

    def generate(self, predictions: Iterable[float]) -> tuple[int, ...]:
        values = tuple(predictions)
        if any(not 0 <= value <= 1 for value in values):
            raise ValueError("predictions must be probabilities between 0 and 1")
        return tuple(int(value >= self.rule.threshold) for value in values)
