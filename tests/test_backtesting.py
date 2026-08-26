from datetime import UTC, datetime

import numpy as np
import pytest

from quant_factory.backtesting.engine import BacktestConfig, BacktestEngine


def test_backtest_executes_signal_on_following_bar_and_applies_costs() -> None:
    result = BacktestEngine(BacktestConfig(initial_capital=1_000, fee_bps=10)).run(
        timestamps=[datetime(2024, 1, day, tzinfo=UTC) for day in range(2, 5)],
        opens=[100, 110, 121],
        closes=[100, 110, 121],
        signals=[1, 0, 0],
    )
    assert result.trades[0].timestamp == datetime(2024, 1, 3, tzinfo=UTC)
    assert result.trades[0].price == 110
    assert result.equity_curve[1] == pytest.approx(999.0)
    # The held position participates in the 110 -> 121 overnight gap before
    # the exit executes at 121.
    assert result.equity_curve[-1] == pytest.approx(1_097.8021)


def test_backtest_applies_slippage_on_each_position_change() -> None:
    result = BacktestEngine(
        BacktestConfig(initial_capital=1_000, fee_bps=0, slippage_bps=10)
    ).run(
        timestamps=[datetime(2024, 1, day, tzinfo=UTC) for day in range(2, 5)],
        opens=[100, 100, 100],
        closes=[100, 100, 100],
        signals=[1, 0, 0],
    )
    assert result.equity_curve[-1] == pytest.approx(998.001)


def test_backtest_rejects_misaligned_or_nonfinite_inputs() -> None:
    engine = BacktestEngine()
    with pytest.raises(ValueError, match="same length"):
        engine.run([datetime.now(UTC)], [1], [1], [])
    with pytest.raises(ValueError, match="finite"):
        engine.run([datetime.now(UTC)], [np.nan], [1], [0])
