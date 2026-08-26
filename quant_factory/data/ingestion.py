"""Validated, deterministic market-data ingestion boundary."""

import logging
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from itertools import pairwise

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class OHLCVBar:
    symbol: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    adj_close: float
    volume: int
    timeframe: str = "1d"
    source: str = "unspecified"


@dataclass(frozen=True, slots=True)
class DataQualityReport:
    rows_accepted: int
    missing_intervals: int
    score: float


@dataclass(frozen=True, slots=True)
class IngestionResult:
    bars: tuple[OHLCVBar, ...]
    quality: DataQualityReport


class MarketDataIngestor:
    """Validate provider records before their immutable persistence."""

    def ingest(self, records: Iterable[OHLCVBar]) -> IngestionResult:
        bars = tuple(sorted((self._normalize(item) for item in records), key=lambda item: item.timestamp))
        self._validate(bars)
        missing = self._missing_daily_intervals(bars)
        score = 1.0 if not bars else max(0.0, 1.0 - missing / len(bars))
        logger.info("market_data_ingested rows=%s missing_intervals=%s score=%.3f", len(bars), missing, score)
        return IngestionResult(bars=bars, quality=DataQualityReport(len(bars), missing, score))

    @staticmethod
    def _normalize(bar: OHLCVBar) -> OHLCVBar:
        timestamp = bar.timestamp.replace(tzinfo=UTC) if bar.timestamp.tzinfo is None else bar.timestamp.astimezone(UTC)
        return OHLCVBar(**{name: getattr(bar, name) for name in OHLCVBar.__dataclass_fields__} | {"timestamp": timestamp})

    @staticmethod
    def _validate(bars: tuple[OHLCVBar, ...]) -> None:
        seen: set[tuple[str, datetime, str, str]] = set()
        for bar in bars:
            key = (bar.symbol, bar.timestamp, bar.timeframe, bar.source)
            if key in seen:
                raise ValueError(f"duplicate market-data record: {key}")
            seen.add(key)
            if not bar.symbol:
                raise ValueError("symbol must not be empty")
            if min(bar.open, bar.high, bar.low, bar.close, bar.adj_close) <= 0:
                raise ValueError("prices must be positive")
            if bar.high < max(bar.open, bar.close) or bar.low > min(bar.open, bar.close):
                raise ValueError("high/low prices do not enclose open and close")
            if bar.volume < 0:
                raise ValueError("volume must be non-negative")

    @staticmethod
    def _missing_daily_intervals(bars: tuple[OHLCVBar, ...]) -> int:
        if len(bars) < 2 or any(bar.timeframe != "1d" for bar in bars):
            return 0
        missing = 0
        symbols = {bar.symbol for bar in bars}
        for symbol in symbols:
            symbol_bars = tuple(bar for bar in bars if bar.symbol == symbol)
            for earlier, later in pairwise(symbol_bars):
                missing += max(0, (later.timestamp.date() - earlier.timestamp.date()).days - 1)
        return missing
