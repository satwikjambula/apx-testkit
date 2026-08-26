"""Structured JSON logging for research-system auditability."""

import json
import logging
from datetime import UTC, datetime


class JsonFormatter(logging.Formatter):
    """Emit portable JSON records without requiring a logging vendor."""

    def format(self, record: logging.LogRecord) -> str:
        return json.dumps(
            {
                "timestamp": datetime.now(UTC).isoformat(),
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
            },
            sort_keys=True,
        )
