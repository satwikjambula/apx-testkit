"""Feature-quality checks that fail closed on common research errors."""

from dataclasses import dataclass

import numpy as np
import polars as pl


@dataclass(frozen=True, slots=True)
class FeatureValidation:
    feature: str
    status: str
    reason: str = ""


class FeatureValidator:
    def __init__(self, *, max_correlation: float = 0.98, min_variance: float = 1e-12) -> None:
        self.max_correlation = max_correlation
        self.min_variance = min_variance

    def validate(self, frame: pl.DataFrame, *, feature_columns: list[str]) -> dict[str, FeatureValidation]:
        reports: dict[str, FeatureValidation] = {}
        for name in feature_columns:
            if name not in frame.columns:
                reports[name] = FeatureValidation(name, "REJECTED", "feature is missing")
            elif "future" in name.lower() or "lookahead" in name.lower():
                reports[name] = FeatureValidation(name, "REJECTED", "lookahead bias detected")
            else:
                values = frame[name].cast(pl.Float64)
                array = values.to_numpy()
                if values.null_count() or not np.isfinite(array[~np.isnan(array)]).all():
                    reports[name] = FeatureValidation(name, "REJECTED", "missing or infinite values")
                elif np.var(array) <= self.min_variance:
                    reports[name] = FeatureValidation(name, "REJECTED", "low variance")
                else:
                    reports[name] = FeatureValidation(name, "APPROVED")
        approved = [name for name, report in reports.items() if report.status == "APPROVED"]
        for index, name in enumerate(approved):
            for other in approved[index + 1:]:
                correlation = np.corrcoef(frame[name].to_numpy(), frame[other].to_numpy())[0, 1]
                if abs(correlation) > self.max_correlation:
                    reports[other] = FeatureValidation(other, "REJECTED", f"high correlation with {name}")
        return reports
