"""Common persisted-model operations."""

import pickle
from pathlib import Path
from typing import Any


class PersistedModel:
    @staticmethod
    def save(model: Any, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(pickle.dumps(model))

    @staticmethod
    def load(path: Path) -> Any:
        return pickle.loads(path.read_bytes())
