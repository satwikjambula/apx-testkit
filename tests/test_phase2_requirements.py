from datetime import UTC, datetime
from pathlib import Path

import polars as pl

from quant_factory.agents.messages import AgentMessage, MessageStatus
from quant_factory.experiments.tracking import ExperimentTracker
from quant_factory.features.validator import FeatureValidator
from quant_factory.models.registry import ModelRegistry, ModelStatus
from quant_factory.strategies.signal import Signal, SignalType


def test_feature_validator_rejects_missing_and_future_leakage() -> None:
    frame = pl.DataFrame({"momentum": [0.1, None], "future_return": [0.1, 0.2]})
    reports = FeatureValidator().validate(frame, feature_columns=["momentum", "future_return"])

    assert reports["momentum"].status == "REJECTED"
    assert "missing" in reports["momentum"].reason
    assert reports["future_return"].status == "REJECTED"
    assert "lookahead" in reports["future_return"].reason


def test_tracker_search_compare_and_full_lineage(tmp_path: Path) -> None:
    tracker = ExperimentTracker(tmp_path / "runs.duckdb")
    first = tracker.start_run("momentum", {"seed": 1}, dataset_version="data-v1", feature_version="feat-v2", model_version="model-v3")
    tracker.finish_run(first.run_id, {"sharpe": 1.2}, [])
    second = tracker.start_run("mean_reversion", {"seed": 2})
    tracker.finish_run(second.run_id, {"sharpe": 0.4}, [])

    assert [run.run_id for run in tracker.search(name="momentum")] == [first.run_id]
    assert tracker.compare([first.run_id, second.run_id], metric="sharpe")[0].run_id == first.run_id
    assert tracker.get_run(first.run_id).dataset_version == "data-v1"


def test_model_lifecycle_and_agent_message_schema(tmp_path: Path) -> None:
    registry = ModelRegistry(tmp_path / "models.duckdb", tmp_path / "artifacts")
    model = registry.register("random_forest", b"model", owner="MLAgent", dataset_version="data-v1", features=("momentum",))
    approved = registry.transition(model.model_id, ModelStatus.APPROVED)
    message = AgentMessage("ResearchAgent", "MLAgent", "TRAIN", "feature-v1", MessageStatus.REQUEST, 0.8)

    assert approved.status == ModelStatus.APPROVED
    assert message.to_dict()["receiver"] == "MLAgent"


def test_signal_limits_position_size_and_serializes() -> None:
    signal = Signal("AAPL", SignalType.BUY, 0.87, 0.02, datetime.now(UTC))
    assert signal.to_dict()["signal"] == "BUY"
