"""Strategy contracts for research-only signal generation."""

from typing import Protocol

from quant_factory.strategies.signal import Signal


class Strategy(Protocol):
    def generate(self, prediction: float, ticker: str) -> Signal: ...
