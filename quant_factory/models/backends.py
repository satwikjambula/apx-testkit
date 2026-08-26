"""Optional LightGBM and XGBoost classifier factories."""

from typing import Any


def create_optional_classifier(model_type: str, *, seed: int) -> Any:
    """Instantiate an explicit optional backend without importing it at application startup."""
    if model_type == "lightgbm":
        try:
            from lightgbm import LGBMClassifier
        except ImportError as error:  # pragma: no cover - depends on optional package
            raise RuntimeError("Install autonomous-alpha-factory[research-backends] for LightGBM") from error
        return LGBMClassifier(random_state=seed, n_estimators=100)
    if model_type == "xgboost":
        try:
            from xgboost import XGBClassifier
        except ImportError as error:  # pragma: no cover - depends on optional package
            raise RuntimeError("Install autonomous-alpha-factory[research-backends] for XGBoost") from error
        return XGBClassifier(random_state=seed, n_estimators=100, n_jobs=1)
    raise ValueError(f"Unsupported optional model backend: {model_type}")
