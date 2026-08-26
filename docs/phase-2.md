# Phase 2: Quant Research Intelligence

Phase 2 adds a reproducible research layer while retaining Phase 1's no-lookahead backtesting boundary.

`ExperimentTracker` and `ModelRegistry` persist metadata in DuckDB. `FeatureStore` uses content-addressed Parquet snapshots. The training pipeline uses a chronological train/test split, then writes a validated model artifact. `StrategyGenerator` turns probability outputs into research signals; `StrategyEvaluator` estimates mean return, volatility, and bootstrap probability of a positive mean.

The default training backend is scikit-learn's deterministic random forest. LightGBM, XGBoost, and MLflow integrations are available through the `research-backends` package extra; `MLflowExperimentTracker` forwards parameters and metrics to a configured MLflow server. A PyTorch protocol is included, but its implementation is explicitly deferred. No brokerage or live order execution is provided.

## Example experiment

1. Publish a validated feature snapshot with `FeatureStore` and record its version.
2. Start an `ExperimentTracker` run with dataset, feature, and model lineage.
3. Use `ModelTrainer` to train/validate chronologically, then attach the model artifact and metrics.
4. Generate `Signal` artifacts; `StrategyPolicyEvaluator` rejects insufficient trades, Sharpe below 1, drawdown above 15%, or turnover above 100%.
5. Persist a Markdown report with `ResearchReportGenerator`.
