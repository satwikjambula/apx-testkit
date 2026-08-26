from pathlib import Path

from quant_factory.local_model import demo_data
from quant_factory.robust_quant import (
    RobustQuantResearch,
    StrategyConfig,
    macd_signals,
)


def test_macd_signals_warm_up_and_are_binary() -> None:
    signals = macd_signals([float(value) for value in range(1, 80)], 5, 20, 5)
    assert set(signals) <= {0, 1}
    assert signals[:24] == (0,) * 24


def test_cross_asset_report_writes_rankings_and_heatmaps(tmp_path: Path) -> None:
    a = demo_data(180)
    b_timestamps, b_opens, b_closes = demo_data(180)
    b = (b_timestamps, list(reversed(b_opens)), list(reversed(b_closes)))
    research = RobustQuantResearch(
        grid=(StrategyConfig("ma", 3, 10), StrategyConfig("macd", 3, 10, 4)),
        folds=2,
        minimum_train_bars=100,
        fee_bps=1,
        slippage_bps=2,
    )
    report = research.run({"AAA": a, "BBB": b}, tmp_path)
    assert len(report.assets) == 2
    assert (tmp_path / "ranking.md").exists()
    assert (tmp_path / "report.json").exists()
    assert (tmp_path / "aaa-robustness.html").exists()
    assert all(len(asset.folds) == 2 for asset in report.assets)
