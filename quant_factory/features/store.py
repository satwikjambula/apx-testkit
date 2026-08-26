"""Content-addressed feature snapshots for reproducible model inputs."""

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

import polars as pl


@dataclass(frozen=True, slots=True)
class FeatureSnapshot:
    snapshot_id: str
    name: str
    source_dataset: str
    row_count: int
    path: Path


@dataclass(frozen=True, slots=True)
class FeatureDefinition:
    name: str
    description: str
    source: str
    version: str
    validation_status: str
    created_date: datetime


class FeatureStore:
    def __init__(self, root: Path) -> None:
        self.root = root

    def publish(self, name: str, frame: pl.DataFrame, *, source_dataset: str) -> FeatureSnapshot:
        payload = frame.serialize(format="binary")
        snapshot_id = hashlib.sha256(name.encode() + source_dataset.encode() + payload).hexdigest()
        path = self.root / f"{snapshot_id}.parquet"
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            frame.write_parquet(path)
        return FeatureSnapshot(snapshot_id, name, source_dataset, frame.height, path)

    def load(self, snapshot_id: str) -> pl.DataFrame:
        path = self.root / f"{snapshot_id}.parquet"
        if not path.exists():
            raise KeyError(snapshot_id)
        return pl.read_parquet(path)

    def save_definition(self, definition: FeatureDefinition) -> Path:
        """Persist an immutable, versioned feature manifest beside snapshots."""
        directory = self.root / "definitions"
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{definition.name}-{definition.version}.json"
        if path.exists():
            raise ValueError(f"Feature definition already exists: {definition.name}@{definition.version}")
        payload = asdict(definition)
        payload["created_date"] = definition.created_date.isoformat()
        path.write_text(json.dumps(payload, sort_keys=True))
        return path

    def define(self, name: str, description: str, source: str, version: str, validation_status: str) -> FeatureDefinition:
        return FeatureDefinition(name, description, source, version, validation_status, datetime.now(UTC))
