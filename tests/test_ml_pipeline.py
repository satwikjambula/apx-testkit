from pathlib import Path

import polars as pl
import pytest

from quant_factory.models.registry import ModelRegistry, ModelStatus
from quant_factory.models.training import TrainingConfig, TrainingPipeline


def dataset() -> pl.DataFrame:
    return pl.DataFrame(
        {
            "timestamp": list(range(12)),
            "momentum": [-3.0, -2.0, -1.0, -0.5, 0.1, 0.2, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0],
            "target": [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
        }
    )


def test_training_uses_chronological_split_and_registers_model(tmp_path: Path) -> None:
    registry = ModelRegistry(tmp_path / "models.duckdb", tmp_path / "artifacts")
    result = TrainingPipeline(registry).train(
        dataset(),
        TrainingConfig("random_forest", ("momentum",), "target", test_fraction=0.25, seed=11),
    )

    assert result.train_rows == 9
    assert result.test_rows == 3
    assert 0 <= result.metrics["accuracy"] <= 1
    assert registry.get(result.model_id).status == ModelStatus.TESTING


def test_training_rejects_unknown_backend_and_invalid_temporal_split(tmp_path: Path) -> None:
    pipeline = TrainingPipeline(ModelRegistry(tmp_path / "models.duckdb", tmp_path / "artifacts"))
    with pytest.raises(ValueError, match="Unsupported"):
        pipeline.train(dataset(), TrainingConfig("unknown", ("momentum",), "target"))
    with pytest.raises(ValueError, match="test_fraction"):
        pipeline.train(dataset(), TrainingConfig("random_forest", ("momentum",), "target", test_fraction=1.0))
