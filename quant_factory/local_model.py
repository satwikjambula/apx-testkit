"""A small, local-first quantitative research model.

The design borrows vectorbt's useful core idea: generate many strategy
configurations as arrays, then evaluate them with a deterministic portfolio
simulator.  It intentionally does not depend on the proprietary vectorbtpro
package.
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import polars as pl

from quant_factory.backtesting.engine import BacktestConfig, BacktestEngine, BacktestResult


@dataclass(frozen=True, slots=True)
class ParameterResult:
    fast_window: int
    slow_window: int
    train_sharpe: float
    train_return: float


@dataclass(frozen=True, slots=True)
class ModelReport:
    selected: ParameterResult
    holdout_sharpe: float
    holdout_return: float
    holdout_max_drawdown: float
    holdout_trades: int
    train_bars: int
    holdout_bars: int


def _rolling_mean(values: np.ndarray, window: int) -> np.ndarray:
    """Return a causal rolling mean, leaving the warm-up interval as NaN."""
    result = np.full(values.shape, np.nan, dtype=float)
    if window > len(values):
        return result
    cumulative = np.concatenate(([0.0], np.cumsum(values, dtype=float)))
    result[window - 1 :] = (cumulative[window:] - cumulative[:-window]) / window
    return result


def moving_average_signals(
    closes: Sequence[float], fast_window: int, slow_window: int
) -> tuple[int, ...]:
    """Create long/flat signals from causal fast and slow moving averages."""
    if fast_window < 1 or slow_window < 2 or fast_window >= slow_window:
        raise ValueError("windows must satisfy 1 <= fast_window < slow_window")
    values = np.asarray(closes, dtype=float)
    if values.ndim != 1 or not np.all(np.isfinite(values)) or np.any(values <= 0):
        raise ValueError("closes must be a one-dimensional sequence of positive finite prices")
    fast = _rolling_mean(values, fast_window)
    slow = _rolling_mean(values, slow_window)
    return tuple(np.where(np.isfinite(slow) & (fast > slow), 1, 0).tolist())


class LocalQuantModel:
    """Select an MA strategy in-sample and report untouched holdout results."""

    def __init__(
        self,
        *,
        fast_windows: Sequence[int] = (5, 10, 20),
        slow_windows: Sequence[int] = (30, 50, 100),
        train_fraction: float = 0.7,
        backtest_config: BacktestConfig | None = None,
    ) -> None:
        pairs = tuple((fast, slow) for fast in fast_windows for slow in slow_windows if fast < slow)
        if not pairs:
            raise ValueError("parameter grid must contain at least one fast < slow pair")
        if not 0.5 <= train_fraction < 1:
            raise ValueError("train_fraction must be in [0.5, 1)")
        self.pairs = pairs
        self.train_fraction = train_fraction
        self.engine = BacktestEngine(backtest_config)

    def fit_evaluate(
        self,
        timestamps: Sequence[datetime],
        opens: Sequence[float],
        closes: Sequence[float],
    ) -> ModelReport:
        if not (len(timestamps) == len(opens) == len(closes)):
            raise ValueError("timestamps, opens, and closes must have the same length")
        minimum_bars = max(slow for _, slow in self.pairs) + 10
        if len(closes) < minimum_bars:
            raise ValueError(f"at least {minimum_bars} bars are required for this parameter grid")
        split = int(len(closes) * self.train_fraction)
        if split <= max(slow for _, slow in self.pairs) or len(closes) - split < 2:
            raise ValueError("train/holdout split does not leave enough bars")

        candidates: list[ParameterResult] = []
        all_signals: dict[tuple[int, int], tuple[int, ...]] = {}
        for fast, slow in self.pairs:
            signals = moving_average_signals(closes, fast, slow)
            all_signals[(fast, slow)] = signals
            result = self.engine.run(
                timestamps[:split], opens[:split], closes[:split], signals[:split]
            )
            candidates.append(
                ParameterResult(
                    fast,
                    slow,
                    result.sharpe,
                    result.equity_curve[-1] / result.equity_curve[0] - 1,
                )
            )

        # Stable tie-breaking prefers the simpler (slower) configuration.
        selected = max(candidates, key=lambda item: (item.train_sharpe, -item.slow_window, -item.fast_window))
        signals = all_signals[(selected.fast_window, selected.slow_window)]
        # Include the final training bar so its close signal can execute at the
        # first holdout open. Metrics begin from a fresh portfolio at that edge.
        holdout: BacktestResult = self.engine.run(
            timestamps[split - 1 :],
            opens[split - 1 :],
            closes[split - 1 :],
            signals[split - 1 :],
        )
        return ModelReport(
            selected=selected,
            holdout_sharpe=holdout.sharpe,
            holdout_return=holdout.equity_curve[-1] / holdout.equity_curve[0] - 1,
            holdout_max_drawdown=holdout.max_drawdown,
            holdout_trades=len(holdout.trades),
            train_bars=split,
            holdout_bars=len(closes) - split,
        )


def load_csv(path: Path) -> tuple[list[datetime], list[float], list[float]]:
    """Load timestamp/open/close columns from a local CSV file."""
    frame = pl.read_csv(path, try_parse_dates=True)
    required = {"timestamp", "open", "close"}
    if not required.issubset(frame.columns):
        raise ValueError(f"CSV is missing columns: {sorted(required - set(frame.columns))}")
    timestamps = frame["timestamp"].to_list()
    if not all(isinstance(value, datetime) for value in timestamps):
        raise ValueError("timestamp values must be ISO-8601 datetimes")
    return timestamps, frame["open"].cast(pl.Float64).to_list(), frame["close"].cast(pl.Float64).to_list()


def demo_data(length: int = 500) -> tuple[list[datetime], list[float], list[float]]:
    """Generate deterministic regime-changing prices for an offline smoke run."""
    rng = np.random.default_rng(7)
    drift = np.where(np.arange(length) < int(length * 0.7), 0.0007, 0.0002)
    returns = drift + rng.normal(0, 0.009, length)
    closes = 100 * np.exp(np.cumsum(returns))
    opens = np.concatenate(([100.0], closes[:-1] * np.exp(rng.normal(0, 0.002, length - 1))))
    start = datetime(2024, 1, 1, tzinfo=UTC)
    timestamps = [start + timedelta(days=index) for index in range(length)]
    return timestamps, opens.tolist(), closes.tolist()


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the local moving-average quant model")
    parser.add_argument("--csv", type=Path, help="CSV with timestamp, open, and close columns")
    parser.add_argument("--fee-bps", type=float, default=1.0)
    args = parser.parse_args(argv)
    data = load_csv(args.csv) if args.csv else demo_data()
    report = LocalQuantModel(backtest_config=BacktestConfig(fee_bps=args.fee_bps)).fit_evaluate(*data)
    print(json.dumps(asdict(report), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
