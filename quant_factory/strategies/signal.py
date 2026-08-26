"""Validated research signal artifact; this is not an order."""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class SignalType(StrEnum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


@dataclass(frozen=True, slots=True)
class Signal:
    ticker: str
    signal: SignalType
    confidence: float
    position_size: float
    timestamp: datetime

    def __post_init__(self) -> None:
        if not 0 <= self.confidence <= 1:
            raise ValueError("confidence must be between 0 and 1")
        if not 0 <= self.position_size <= 0.02:
            raise ValueError("position size must be between 0 and the 2% risk limit")

    def to_dict(self) -> dict[str, object]:
        return {"ticker": self.ticker, "signal": self.signal.value, "confidence": self.confidence, "position_size": self.position_size}
