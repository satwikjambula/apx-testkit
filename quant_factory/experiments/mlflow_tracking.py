"""MLflow adapter for teams that configure a remote experiment tracking server."""

from collections.abc import Mapping


class MLflowExperimentTracker:
    """Forward a completed, reproducible run to MLflow when the optional backend is installed."""

    def log_run(self, name: str, parameters: Mapping[str, object], metrics: Mapping[str, float]) -> str:
        try:
            import mlflow
        except ImportError as error:  # pragma: no cover - depends on optional package
            raise RuntimeError("Install autonomous-alpha-factory[research-backends] for MLflow tracking") from error
        with mlflow.start_run(run_name=name) as run:
            mlflow.log_params(dict(parameters))
            mlflow.log_metrics(dict(metrics))
            return str(run.info.run_id)
