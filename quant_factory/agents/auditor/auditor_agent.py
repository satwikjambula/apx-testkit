"""Independent compliance validation agent."""

from quant_factory.approvals.review import ReviewDecision


class AuditorAgent:
    name = "AuditorAgent"
    role = "Independent validator"

    def review(self, compliant: bool) -> ReviewDecision:
        return ReviewDecision.APPROVE if compliant else ReviewDecision.REJECT
