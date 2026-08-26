"""Long-only backtesting with next-bar execution and explicit transaction costs."""

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from math import isfinite, sqrt

import numpy as np

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class BacktestConfig:
    initial_capital: float = 100_000.0
    fee_bps: float = 1.0
    slippage_bps: float = 0.0
    periods_per_year: int = 252


@dataclass(frozen=True, slots=True)
class Trade:
    timestamp: datetime
    target_weight: int
    price: float
    cost: float


@dataclass(frozen=True, slots=True)
class BacktestResult:
    equity_curve: tuple[float, ...]
    trades: tuple[Trade, ...]
    sharpe: float
    max_drawdown: float


class BacktestEngine:
    def __init__(self, config: BacktestConfig | None = None) -> None:
        self.config = config or BacktestConfig()

    def run(self, timestamps: Sequence[datetime], opens: Sequence[float], closes: Sequence[float], signals: Sequence[int]) -> BacktestResult:
        lengths = {len(timestamps), len(opens), len(closes), len(signals)}
        if len(lengths) != 1:
            raise ValueError("timestamps, opens, closes, and signals must have the same length")
        if not timestamps:
            raise ValueError("at least one bar is required")
        prices = [*opens, *closes]
        if not all(isfinite(price) and price > 0 for price in prices):
            raise ValueError("prices must be finite and positive")
        if not all(signal in (0, 1) for signal in signals):
            raise ValueError("signals must be 0 or 1")
        equity = self.config.initial_capital
        weight = 0
        curve: list[float] = [equity]
        trades: list[Trade] = []
        for index in range(1, len(timestamps)):
            # Mark the position through the close-to-open gap before trading.
            equity *= 1 + weight * (opens[index] / closes[index - 1] - 1)
            target = signals[index - 1]  # The prior close signal executes at this bar's open.
            if target != weight:
                notional = equity * abs(target - weight)
                cost = notional * (self.config.fee_bps + self.config.slippage_bps) / 10_000
                equity -= cost
                trades.append(Trade(timestamps[index], target, float(opens[index]), cost))
                weight = target
            equity *= 1 + weight * (closes[index] / opens[index] - 1)
            curve.append(equity)
        returns = np.diff(np.asarray(curve)) / np.asarray(curve[:-1])
        sharpe = self._sharpe(returns)
        maximum = np.maximum.accumulate(np.asarray(curve))
        drawdown = np.min(np.asarray(curve) / maximum - 1)
        result = BacktestResult(tuple(curve), tuple(trades), sharpe, float(drawdown))
        logger.info(
            "backtest_complete bars=%s trades=%s final_equity=%.2f sharpe=%.3f",
            len(timestamps), len(trades), result.equity_curve[-1], result.sharpe,
        )
        return result

    def _sharpe(self, returns: np.ndarray) -> float:
        if len(returns) < 2 or np.std(returns, ddof=1) == 0:
            return 0.0
        return float(sqrt(self.config.periods_per_year) * np.mean(returns) / np.std(returns, ddof=1))
