"""Rank experiments by risk-adjusted performance."""


def score(metrics: dict[str, float]) -> float:
    """Penalize drawdown while rewarding risk-adjusted return."""
    return metrics.get("sharpe", 0.0) - metrics.get("drawdown", 0.0)
