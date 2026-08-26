from datetime import UTC, datetime
from typing import Any, cast

import polars as pl
import pytest

from quant_factory.data.yahoo import YahooFinanceClient
from quant_factory.execution.alpaca_paper import AlpacaPaperBroker, PaperOrder


def test_yahoo_adapter_normalizes_downloaded_ohlcv() -> None:
    def downloader(**_: object) -> pl.DataFrame:
        return pl.DataFrame(
            {
                "Date": [datetime(2024, 1, 2, tzinfo=UTC)],
                "Open": [100.0], "High": [102.0], "Low": [99.0], "Close": [101.0],
                "Adj Close": [101.0], "Volume": [1_000],
            }
        )

    bars = YahooFinanceClient(downloader=downloader).daily_bars("SPY", "2024-01-01", "2024-01-03")
    assert bars[0].symbol == "SPY"
    assert bars[0].source == "yahoo_finance"
    assert bars[0].timestamp == datetime(2024, 1, 2, tzinfo=UTC)


def test_alpaca_paper_broker_requires_explicit_confirmation_and_submits_paper_order() -> None:
    submitted: list[dict[str, object]] = []

    class FakeClient:
        def submit_order(self, order_data: object) -> object:
            request = cast(Any, order_data)
            submitted.append(
                {"symbol": request.symbol, "qty": request.qty, "side": request.side}
            )
            return type("Order", (), {"id": "paper-123", "status": "accepted"})()

    broker = AlpacaPaperBroker(client=FakeClient())
    order = PaperOrder("AAPL", 2, "buy")
    with pytest.raises(PermissionError, match="confirm=True"):
        broker.submit(order)
    receipt = broker.submit(order, confirm=True)
    assert receipt.order_id == "paper-123"
    assert submitted[0]["symbol"] == "AAPL"
