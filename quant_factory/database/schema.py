"""Portable SQL schema for immutable, versioned market datasets."""

DATASET_VERSIONS_TABLE = """
CREATE TABLE IF NOT EXISTS dataset_versions (
    dataset_id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    source VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checksum VARCHAR(128) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (name, version)
);
""".strip()

MARKET_DATA_TABLE = """
CREATE TABLE IF NOT EXISTS market_data (
    dataset_id UUID NOT NULL REFERENCES dataset_versions(dataset_id),
    symbol VARCHAR(32) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    timeframe VARCHAR(16) NOT NULL,
    source VARCHAR(255) NOT NULL,
    open DOUBLE PRECISION NOT NULL,
    high DOUBLE PRECISION NOT NULL,
    low DOUBLE PRECISION NOT NULL,
    close DOUBLE PRECISION NOT NULL,
    adj_close DOUBLE PRECISION NOT NULL,
    volume BIGINT NOT NULL CHECK (volume >= 0),
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (symbol, timestamp, timeframe, source),
    CHECK (open > 0 AND high > 0 AND low > 0 AND close > 0 AND adj_close > 0),
    CHECK (high >= low AND high >= open AND high >= close),
    CHECK (low <= open AND low <= close)
);
""".strip()


def schema_statements() -> tuple[str, ...]:
    """Return DDL in dependency order for a PostgreSQL migration runner."""
    return (DATASET_VERSIONS_TABLE, MARKET_DATA_TABLE)
