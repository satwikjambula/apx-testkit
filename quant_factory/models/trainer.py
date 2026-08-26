"""Phase 2 public model trainer API."""

from pathlib import Path
from typing import Any

import polars as pl

from quant_factory.models.base import PersistedModel
from quant_factory.models.training import TrainingConfig, TrainingPipeline, TrainingResult


class ModelTrainer(TrainingPipeline):
    """Public training contract with chronological validation and persistence."""

    def validate(self, frame: pl.DataFrame, config: TrainingConfig) -> TrainingResult:
        return self.train(frame, config)

    @staticmethod
    def save(model: Any, path: Path) -> None:
        PersistedModel.save(model, path)

    @staticmethod
    def load(path: Path) -> Any:
        return PersistedModel.load(path)
