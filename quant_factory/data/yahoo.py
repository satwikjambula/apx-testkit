"""Yahoo Finance historical-data adapter for research and paper-trading inputs."""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import polars as pl

from quant_factory.data.ingestion import OHLCVBar


class YahooFinanceClient:
    """Fetch OHLCV bars through yfinance, with injection support for deterministic tests."""

    def __init__(self, downloader: Callable[..., Any] | None = None) -> None:
        self._downloader = downloader

    def daily_bars(self, symbol: str, start: str, end: str) -> tuple[OHLCVBar, ...]:
        frame = self._download(symbol, start, end)
        if not isinstance(frame, pl.DataFrame):
            frame = pl.from_pandas(frame.reset_index())
        required = {"Date", "Open", "High", "Low", "Close", "Adj Close", "Volume"}
        if missing := required - set(frame.columns):
            raise ValueError(f"Yahoo Finance response missing columns: {sorted(missing)}")
        return tuple(
            OHLCVBar(
                symbol=symbol,
                timestamp=self._timestamp(row["Date"]),
                open=float(row["Open"]), high=float(row["High"]), low=float(row["Low"]),
                close=float(row["Close"]), adj_close=float(row["Adj Close"]), volume=int(row["Volume"]),
                source="yahoo_finance",
            )
            for row in frame.iter_rows(named=True)
        )

    def _download(self, symbol: str, start: str, end: str) -> Any:
        if self._downloader is not None:
            return self._downloader(tickers=symbol, start=start, end=end, interval="1d", auto_adjust=False)
        try:
            import yfinance
        except ImportError as error:  # pragma: no cover - requires optional package
            raise RuntimeError("Install autonomous-alpha-factory[market-data] for Yahoo Finance ingestion") from error
        return yfinance.download(tickers=symbol, start=start, end=end, interval="1d", auto_adjust=False)

    @staticmethod
    def _timestamp(value: object) -> datetime:
        if isinstance(value, datetime):
            return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
        return datetime.fromisoformat(str(value)).replace(tzinfo=UTC)
