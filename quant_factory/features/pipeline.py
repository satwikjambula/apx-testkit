"""Feature transforms that expose only information known before the prediction bar."""

import logging
from dataclasses import dataclass

import polars as pl

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class FeatureSpec:
    name: str
    window: int


class FeaturePipeline:
    """Apply grouped, timestamp-ordered features with a mandatory one-bar lag."""

    def __init__(self, specs: list[FeatureSpec]) -> None:
        self.specs = specs

    def transform(self, frame: pl.DataFrame) -> pl.DataFrame:
        required = {"symbol", "timestamp", "close"}
        if not required.issubset(frame.columns):
            raise ValueError(f"Required columns are missing: {sorted(required - set(frame.columns))}")
        if frame.sort(["symbol", "timestamp"]).equals(frame) is False:
            raise ValueError("Input must be sorted by symbol and timestamp")
        expressions: list[pl.Expr] = []
        for spec in self.specs:
            if spec.window < 1:
                raise ValueError("Feature window must be positive")
            if spec.name == "return":
                expressions.append(
                    pl.col("close").pct_change(spec.window).shift(1).over("symbol").alias(f"return_{spec.window}")
                )
            elif spec.name == "rolling_volatility":
                expressions.append(
                    pl.col("close").pct_change().rolling_std(spec.window).shift(1).over("symbol").alias(f"rolling_volatility_{spec.window}")
                )
            else:
                raise ValueError(f"Unsupported feature: {spec.name}")
        result = frame.with_columns(expressions)
        logger.info("features_computed rows=%s feature_count=%s", result.height, len(expressions))
        return result
