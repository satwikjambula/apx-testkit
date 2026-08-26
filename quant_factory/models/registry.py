"""Model artifact registry with immutable metadata records."""

import json
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from uuid import uuid4

import duckdb


class ModelStatus(StrEnum):
    DEVELOPMENT = "DEVELOPMENT"
    TESTING = "TESTING"
    APPROVED = "APPROVED"
    PRODUCTION = "PRODUCTION"
    RETIRED = "RETIRED"


@dataclass(frozen=True, slots=True)
class RegisteredModel:
    model_id: str
    model_type: str
    status: ModelStatus
    artifact_path: Path
    owner: str = ""
    dataset_version: str = ""
    features: tuple[str, ...] = ()


class ModelRegistry:
    def __init__(self, database_path: Path, artifact_directory: Path) -> None:
        self.database_path = database_path
        self.artifact_directory = artifact_directory
        self.artifact_directory.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS model_registry "
                "(model_id VARCHAR PRIMARY KEY, model_type VARCHAR, status VARCHAR, artifact_path VARCHAR, "
                "owner VARCHAR, dataset_version VARCHAR, features_json VARCHAR)"
            )

    def _connect(self) -> duckdb.DuckDBPyConnection:
        return duckdb.connect(str(self.database_path))

    def register(
        self, model_type: str, payload: bytes, *, owner: str = "", dataset_version: str = "", features: tuple[str, ...] = (),
    ) -> RegisteredModel:
        model_id = str(uuid4())
        path = self.artifact_directory / f"{model_id}.joblib"
        path.write_bytes(payload)
        model = RegisteredModel(model_id, model_type, ModelStatus.TESTING, path, owner, dataset_version, features)
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO model_registry VALUES (?, ?, ?, ?, ?, ?, ?)",
                [model_id, model_type, model.status, str(path), owner, dataset_version, json.dumps(features)],
            )
        return model

    def get(self, model_id: str) -> RegisteredModel:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM model_registry WHERE model_id = ?", [model_id]).fetchone()
        if row is None:
            raise KeyError(model_id)
        return RegisteredModel(row[0], row[1], ModelStatus(row[2]), Path(row[3]), row[4], row[5], tuple(json.loads(row[6])))

    def transition(self, model_id: str, status: ModelStatus) -> RegisteredModel:
        with self._connect() as connection:
            updated = connection.execute(
                "UPDATE model_registry SET status = ? WHERE model_id = ? RETURNING model_id", [status, model_id]
            ).fetchone()
        if updated is None:
            raise KeyError(model_id)
        return self.get(model_id)
