"""Creates structured research hypotheses."""

from quant_factory.research.hypothesis import Hypothesis


class ResearchAgent:
    name = "ResearchAgent"
    role = "Alpha researcher"

    def propose_momentum_hypothesis(self) -> Hypothesis:
        return Hypothesis("Momentum is persistent in stable regimes", "Behavioral under-reaction", ("return_12m", "volatility_30d"), "walk-forward validation")
