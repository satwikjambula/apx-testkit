# Phase 1: Research Foundations

This implementation provides versioned PostgreSQL schema DDL, a validated OHLCV ingestion boundary, leakage-safe Polars features, and a deterministic long-only backtesting engine.

## Example

```python
from datetime import UTC, datetime
from quant_factory.backtesting.engine import BacktestEngine

result = BacktestEngine().run(
    [datetime(2024, 1, d, tzinfo=UTC) for d in (2, 3, 4)],
    [100, 101, 102], [101, 102, 103], [1, 0, 0],
)
print(result.sharpe)
```

Signals created at a bar close execute at the next bar open. The engine applies fees at each weight change, and it deliberately contains no brokerage, order-routing, or live-trading functionality.

The ingestion, feature, and backtesting modules emit standard Python `INFO` logs with row, feature, trade, and metric counts. Configure logging in the host application or test harness.
