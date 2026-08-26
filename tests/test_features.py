from datetime import UTC, datetime

import polars as pl
import pytest

from quant_factory.features.pipeline import FeaturePipeline, FeatureSpec


def test_pipeline_lags_return_features_to_prevent_same_bar_leakage() -> None:
    frame = pl.DataFrame(
        {
            "symbol": ["SPY"] * 4,
            "timestamp": [datetime(2024, 1, day, tzinfo=UTC) for day in range(2, 6)],
            "close": [100.0, 110.0, 121.0, 133.1],
        }
    )
    result = FeaturePipeline([FeatureSpec("return", window=1)]).transform(frame)

    assert result["return_1"].to_list() == [None, None, 0.1, 0.1]


def test_pipeline_rejects_unsorted_or_unknown_feature() -> None:
    frame = pl.DataFrame({"symbol": ["SPY", "SPY"], "timestamp": [2, 1], "close": [2.0, 1.0]})
    with pytest.raises(ValueError, match="sorted"):
        FeaturePipeline([FeatureSpec("return", 1)]).transform(frame)
    with pytest.raises(ValueError, match="Unsupported"):
        FeaturePipeline([FeatureSpec("mystery", 1)]).transform(frame.sort("timestamp"))
