"""Validated YAML configuration loading at the system boundary."""

from pathlib import Path
from typing import Any

import yaml


def load_yaml(path: Path) -> dict[str, Any]:
    """Load an object-root YAML configuration; unsafe YAML tags are prohibited."""
    with path.open() as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise TypeError("YAML configuration root must be a mapping")
    return data
