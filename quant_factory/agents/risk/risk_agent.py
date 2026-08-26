"""Capital-protection review agent with veto authority."""

from quant_factory.approvals.review import ReviewDecision


class RiskAgent:
    name = "RiskAgent"
    role = "Capital protector"

    def review(self, max_drawdown: float) -> ReviewDecision:
        return ReviewDecision.REJECT if max_drawdown > 0.15 else ReviewDecision.APPROVE
