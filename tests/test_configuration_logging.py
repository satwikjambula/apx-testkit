import json
import logging
from pathlib import Path

from quant_factory.configs import load_yaml
from quant_factory.logging import JsonFormatter


def test_yaml_loader_and_json_formatter(tmp_path: Path) -> None:
    config = tmp_path / "research.yaml"
    config.write_text("model:\n  type: random_forest\n")

    assert load_yaml(config) == {"model": {"type": "random_forest"}}
    record = logging.LogRecord("research", logging.INFO, "", 0, "trained", (), None)
    payload = json.loads(JsonFormatter().format(record))
    assert payload["message"] == "trained"
    assert payload["logger"] == "research"
