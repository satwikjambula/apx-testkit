from datetime import UTC, datetime, timedelta

import pytest

from quant_factory.local_model import LocalQuantModel, demo_data, moving_average_signals


def test_moving_average_signals_are_causal_and_warm_up_flat() -> None:
    signals = moving_average_signals([1, 2, 3, 4, 3, 2], 2, 3)
    assert signals == (0, 0, 1, 1, 1, 0)


def test_local_model_selects_only_on_train_and_reports_holdout() -> None:
    timestamps, opens, closes = demo_data(180)
    report = LocalQuantModel(
        fast_windows=(3, 5), slow_windows=(10, 20), train_fraction=0.7
    ).fit_evaluate(timestamps, opens, closes)
    assert (report.selected.fast_window, report.selected.slow_window) in {
        (3, 10), (3, 20), (5, 10), (5, 20)
    }
    assert report.train_bars == 125
    assert report.holdout_bars == 55
    assert -1 <= report.holdout_max_drawdown <= 0


def test_local_model_rejects_too_little_data() -> None:
    timestamps = [datetime(2024, 1, 1, tzinfo=UTC) + timedelta(days=i) for i in range(10)]
    with pytest.raises(ValueError, match="at least"):
        LocalQuantModel(fast_windows=(2,), slow_windows=(5,)).fit_evaluate(
            timestamps, [100.0] * 10, [100.0] * 10
        )
