"""Structured, testable research hypothesis artifact."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Hypothesis:
    statement: str
    economic_rationale: str
    features: tuple[str, ...]
    methodology: str
