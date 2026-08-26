"""Chronological, reproducible ML training pipeline."""

import logging
import pickle
from dataclasses import dataclass

import polars as pl
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score

from quant_factory.models.registry import ModelRegistry

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class TrainingConfig:
    model_type: str
    features: tuple[str, ...]
    target: str
    test_fraction: float = 0.2
    seed: int = 42


@dataclass(frozen=True, slots=True)
class TrainingResult:
    model_id: str
    metrics: dict[str, float]
    train_rows: int
    test_rows: int


class TrainingPipeline:
    """Train only on the chronologically earlier segment of a feature snapshot."""

    def __init__(self, registry: ModelRegistry) -> None:
        self.registry = registry

    def train(self, frame: pl.DataFrame, config: TrainingConfig) -> TrainingResult:
        if config.model_type != "random_forest":
            raise ValueError(f"Unsupported model backend: {config.model_type}")
        if not 0 < config.test_fraction < 1:
            raise ValueError("test_fraction must be between 0 and 1")
        required = set(config.features) | {config.target}
        if missing := required - set(frame.columns):
            raise ValueError(f"Missing training columns: {sorted(missing)}")
        split = int(frame.height * (1 - config.test_fraction))
        if split == 0 or split == frame.height:
            raise ValueError("temporal split must contain train and test observations")
        train, test = frame[:split], frame[split:]
        classifier = RandomForestClassifier(n_estimators=100, random_state=config.seed, n_jobs=1)
        classifier.fit(train.select(config.features).to_numpy(), train[config.target].to_numpy())
        predictions = classifier.predict(test.select(config.features).to_numpy())
        metrics = {"accuracy": float(accuracy_score(test[config.target].to_numpy(), predictions))}
        model = self.registry.register(config.model_type, pickle.dumps(classifier))
        logger.info("model_trained model_id=%s train_rows=%s test_rows=%s", model.model_id, train.height, test.height)
        return TrainingResult(model.model_id, metrics, train.height, test.height)
