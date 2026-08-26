from pathlib import Path

from quant_factory.experiments.tracking import ExperimentTracker


def test_tracker_persists_reproducible_finished_run(tmp_path: Path) -> None:
    tracker = ExperimentTracker(tmp_path / "research.duckdb")
    run = tracker.start_run("momentum", {"seed": 7, "model": "random_forest"})
    tracker.finish_run(run.run_id, {"sharpe": 1.25}, ["models/model.pkl"])

    stored = tracker.get_run(run.run_id)
    assert stored.status == "FINISHED"
    assert stored.config_hash == run.config_hash
    assert stored.metrics == {"sharpe": 1.25}
    assert stored.artifacts == ("models/model.pkl",)
