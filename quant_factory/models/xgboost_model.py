"""XGBoost adapter factory."""

from quant_factory.models.backends import create_optional_classifier


def create(seed: int = 42) -> object:
    return create_optional_classifier("xgboost", seed=seed)
