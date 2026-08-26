from quant_factory.database.schema import MARKET_DATA_TABLE, schema_statements


def test_market_data_schema_has_immutable_identity_and_ohlcv_checks() -> None:
    assert "PRIMARY KEY (symbol, timestamp, timeframe, source)" in MARKET_DATA_TABLE
    assert "CHECK (open > 0" in MARKET_DATA_TABLE
    assert "adj_close > 0" in MARKET_DATA_TABLE


def test_schema_includes_dataset_versioning() -> None:
    statements = schema_statements()
    assert any("dataset_versions" in statement for statement in statements)
