# Local quant model

The repository includes a local, VectorBT-inspired research workflow. It creates
moving-average signals for a parameter grid, selects a configuration using only
the chronological training segment, and reports results on a held-out segment.
Orders execute on the next bar and include configurable fees.

Run the deterministic offline demo:

```bash
python -m quant_factory.local_model
```

Or use local market data:

```bash
python -m quant_factory.local_model --csv prices.csv --fee-bps 2
```

The CSV must contain `timestamp`, `open`, and `close` columns, sorted oldest to
newest. The command prints a JSON report suitable for saving or passing to
another local process.

This module does not bundle or imitate the proprietary `vectorbtpro` package.
It applies the public architectural idea of array-oriented parameter research
using NumPy and the project's deterministic backtester.
