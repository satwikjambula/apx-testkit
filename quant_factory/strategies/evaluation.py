"""Statistical strategy evaluation on realized, aligned returns."""

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True, slots=True)
class StrategyEvaluation:
    observations: int
    mean_return: float
    volatility: float
    bootstrap_positive_probability: float


class StrategyEvaluator:
    def __init__(self, *, seed: int = 42, bootstrap_samples: int = 1_000) -> None:
        if bootstrap_samples < 1:
            raise ValueError("bootstrap_samples must be positive")
        self.seed = seed
        self.bootstrap_samples = bootstrap_samples

    def evaluate(self, returns: np.ndarray, signals: np.ndarray) -> StrategyEvaluation:
        if returns.ndim != 1 or signals.ndim != 1 or len(returns) != len(signals):
            raise ValueError("returns and signals must be aligned one-dimensional arrays")
        strategy_returns = returns * signals
        generator = np.random.default_rng(self.seed)
        sampled = generator.choice(strategy_returns, size=(self.bootstrap_samples, len(strategy_returns)), replace=True)
        probability = float(np.mean(np.mean(sampled, axis=1) > 0))
        return StrategyEvaluation(
            len(strategy_returns),
            float(np.mean(strategy_returns)),
            float(np.std(strategy_returns, ddof=0)),
            probability,
        )
