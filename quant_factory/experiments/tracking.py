"""DuckDB-backed, immutable experiment metadata tracking."""

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import duckdb


@dataclass(frozen=True, slots=True)
class ExperimentRun:
    run_id: str
    name: str
    config_hash: str
    status: str
    metrics: dict[str, float]
    artifacts: tuple[str, ...]
    dataset_version: str = ""
    feature_version: str = ""
    model_version: str = ""
    created_at: str = ""


class ExperimentTracker:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self._initialize()

    def _connect(self) -> duckdb.DuckDBPyConnection:
        return duckdb.connect(str(self.database_path))

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """CREATE TABLE IF NOT EXISTS experiment_runs (
                    run_id VARCHAR PRIMARY KEY, name VARCHAR NOT NULL, config_hash VARCHAR NOT NULL,
                    status VARCHAR NOT NULL, metrics_json VARCHAR NOT NULL, artifacts_json VARCHAR NOT NULL,
                    dataset_version VARCHAR NOT NULL, feature_version VARCHAR NOT NULL,
                    model_version VARCHAR NOT NULL, created_at VARCHAR NOT NULL
                )"""
            )

    def start_run(
        self,
        name: str,
        config: dict[str, object],
        *,
        dataset_version: str = "",
        feature_version: str = "",
        model_version: str = "",
    ) -> ExperimentRun:
        config_hash = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()
        run = ExperimentRun(
            str(uuid4()), name, config_hash, "RUNNING", {}, (), dataset_version, feature_version,
            model_version, datetime.now(UTC).isoformat(),
        )
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO experiment_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [run.run_id, run.name, run.config_hash, run.status, "{}", "[]", dataset_version,
                 feature_version, model_version, run.created_at],
            )
        return run

    def finish_run(self, run_id: str, metrics: dict[str, float], artifacts: list[str]) -> None:
        with self._connect() as connection:
            updated = connection.execute(
                "UPDATE experiment_runs SET status = 'FINISHED', metrics_json = ?, artifacts_json = ? "
                "WHERE run_id = ? AND status = 'RUNNING' RETURNING run_id",
                [json.dumps(metrics, sort_keys=True), json.dumps(artifacts), run_id],
            ).fetchone()
        if updated is None:
            raise ValueError(f"Cannot finish experiment run: {run_id}")

    def get_run(self, run_id: str) -> ExperimentRun:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM experiment_runs WHERE run_id = ?", [run_id]).fetchone()
        if row is None:
            raise KeyError(run_id)
        return ExperimentRun(
            row[0], row[1], row[2], row[3], json.loads(row[4]), tuple(json.loads(row[5])),
            row[6], row[7], row[8], row[9],
        )

    def search(self, *, name: str | None = None, status: str | None = "FINISHED") -> list[ExperimentRun]:
        clauses, values = [], []
        if name is not None:
            clauses.append("name = ?")
            values.append(name)
        if status is not None:
            clauses.append("status = ?")
            values.append(status)
        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._connect() as connection:
            ids = connection.execute(f"SELECT run_id FROM experiment_runs{where} ORDER BY created_at", values).fetchall()
        return [self.get_run(row[0]) for row in ids]

    def compare(self, run_ids: list[str], *, metric: str) -> list[ExperimentRun]:
        return sorted((self.get_run(run_id) for run_id in run_ids), key=lambda run: run.metrics.get(metric, float("-inf")), reverse=True)
