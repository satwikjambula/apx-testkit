# Robust cross-asset research

Run broad moving-average and MACD sweeps with expanding-window walk-forward
validation, buy-and-hold benchmarks, fees, slippage, heatmaps, and a ranked
cross-asset report:

```bash
python -m quant_factory.robust_quant \
  AAPL=prices_aapl.csv AMZN=prices_amzn.csv NBIS=prices.csv \
  --fee-bps 1 --slippage-bps 2 --folds 4 --output quant-report
```

Outputs include `ranking.md`, a machine-readable `report.json`, and one local
HTML robustness heatmap per asset. Each fold selects parameters using only data
available before its test interval. Results remain research evidence, not a
forecast or investment recommendation.
