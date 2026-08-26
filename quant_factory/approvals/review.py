"""Auditable peer reviews that block self-approval."""

from dataclasses import dataclass
from enum import StrEnum


class ReviewDecision(StrEnum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"


@dataclass(frozen=True, slots=True)
class Review:
    artifact: str
    creator: str
    reviewer: str
    decision: ReviewDecision
    reason: str


class ReviewService:
    def __init__(self) -> None:
        self._reviews: list[Review] = []

    def review(self, artifact: str, *, creator: str, reviewer: str, decision: ReviewDecision, reason: str) -> Review:
        if creator == reviewer:
            raise PermissionError("Agents cannot approve their own work")
        review = Review(artifact, creator, reviewer, decision, reason)
        self._reviews.append(review)
        return review

    def is_vetoed(self, artifact: str) -> bool:
        return any(review.artifact == artifact and review.decision == ReviewDecision.REJECT and review.reviewer in {"RiskAgent", "AuditorAgent"} for review in self._reviews)
