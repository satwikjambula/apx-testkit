from datetime import UTC, datetime, timedelta

import pytest

from quant_factory.data.ingestion import MarketDataIngestor, OHLCVBar


def bar(at: datetime, **changes: object) -> OHLCVBar:
    values: dict[str, object] = {
        "symbol": "SPY",
        "timestamp": at,
        "open": 100.0,
        "high": 103.0,
        "low": 99.0,
        "close": 102.0,
        "adj_close": 102.0,
        "volume": 1_000,
    }
    values.update(changes)
    return OHLCVBar(**values)  # type: ignore[arg-type]


def test_ingestion_normalizes_timezone_and_returns_quality_report() -> None:
    ingestor = MarketDataIngestor()
    naive_timestamp = datetime(2024, 1, 2, tzinfo=UTC).replace(tzinfo=None)
    result = ingestor.ingest([bar(naive_timestamp), bar(datetime(2024, 1, 3, tzinfo=UTC))])

    assert len(result.bars) == 2
    assert all(item.timestamp.tzinfo == UTC for item in result.bars)
    assert result.quality.rows_accepted == 2
    assert result.quality.score == 1.0


def test_ingestion_rejects_duplicate_and_invalid_prices() -> None:
    at = datetime(2024, 1, 2, tzinfo=UTC)
    ingestor = MarketDataIngestor()

    with pytest.raises(ValueError, match="duplicate"):
        ingestor.ingest([bar(at), bar(at)])
    with pytest.raises(ValueError, match="high"):
        ingestor.ingest([bar(at, high=98.0)])


def test_ingestion_detects_missing_daily_candles() -> None:
    at = datetime(2024, 1, 5, tzinfo=UTC)
    result = MarketDataIngestor().ingest([bar(at), bar(at + timedelta(days=3))])
    assert result.quality.missing_intervals == 2
    assert result.quality.score < 1.0
