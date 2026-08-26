"""Strategy acceptance policy layered on top of statistical evaluation."""

from dataclasses import dataclass

from quant_factory.strategies.evaluation import StrategyEvaluation


@dataclass(frozen=True, slots=True)
class StrategyDecision:
    status: str
    reasons: tuple[str, ...]


class StrategyPolicyEvaluator:
    def __init__(self, *, min_sharpe: float = 1.0, max_drawdown: float = 0.15, min_trades: int = 30) -> None:
        self.min_sharpe = min_sharpe
        self.max_drawdown = max_drawdown
        self.min_trades = min_trades

    def decide(self, evaluation: StrategyEvaluation, *, sharpe: float, max_drawdown: float, turnover: float) -> StrategyDecision:
        reasons = []
        if sharpe < self.min_sharpe:
            reasons.append("Sharpe below minimum")
        if max_drawdown > self.max_drawdown:
            reasons.append("excessive drawdown")
        if turnover > 1.0:
            reasons.append("unrealistic turnover")
        if evaluation.observations < self.min_trades:
            reasons.append("insufficient trades")
        return StrategyDecision("PASS" if not reasons else "REJECT", tuple(reasons))
