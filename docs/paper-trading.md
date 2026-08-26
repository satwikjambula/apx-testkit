# Yahoo Finance and Alpaca Paper Trading

`YahooFinanceClient` downloads daily historical OHLCV data and returns the validated Phase 1 `OHLCVBar` format. Install its runtime dependency with `python3 -m pip install -e '.[market-data]'`.

`AlpacaPaperBroker` connects only to Alpaca's paper endpoint. Set `ALPACA_PAPER_API_KEY` and `ALPACA_PAPER_SECRET_KEY`; it never reads generic/live credential names. Submitting requires `confirm=True` and produces a paper-order receipt. Install the runtime dependency with `python3 -m pip install -e '.[paper-trading]'`.

Neither integration executes live trades or handles capital.
