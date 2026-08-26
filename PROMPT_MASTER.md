# Project: Autonomous Alpha Factory

## Mission

Build an autonomous quantitative research platform that discovers, tests, validates, and monitors trading strategies. The system behaves like a small quantitative hedge-fund research team. It is a research and decision-support platform, not a trading bot.

## Engineering Principles

1. Production-quality Python.
2. Every component is modular and every experiment reproducible.
3. Never use future market information or leak test data.
4. Every model requires validation; every strategy requires risk approval.
5. Every decision must be logged.

## Technology Stack

Python 3.12; FastAPI, PostgreSQL, DuckDB, Polars, NumPy, scikit-learn, LightGBM, XGBoost, PyTorch, MLflow, VectorBT, and Docker. Tests use pytest, Ruff, and MyPy.

## Agent Architecture

Agents communicate through structured messages. Each agent has a mission, responsibilities, inputs, outputs, rules, and tests. Their output format is:

```json
{"agent":"","task":"","status":"","results":[],"confidence":0,"artifacts":[]}
```

Required agents: Orchestrator, Research, Data, Feature, ML, Strategy, Backtest, Risk, Portfolio, Monitoring, and Auditor.

### Orchestrator Agent

Coordinates project state, work assignment, experiment tracking, completion validation, and conflict escalation. It does not write strategies. It must never approve a strategy without backtest, risk, and audit reviews, and may never override Risk. Success metrics: completed experiments, research velocity, and failed deployments.

### Data Agent

Maintains reliable OHLCV, volume, fundamentals, and economic data: download, normalize, validate, and store it. Check missing candles, duplicates, invalid prices, corporate actions, and timestamp issues. Output a dataset artifact such as `{"dataset":"SP500_daily_v1","rows":2500000,"quality_score":0.98}`. Never silently modify historical data or synthesize prices.

### Research Agent

Discovers ideas, reads research papers, and proposes experiments. Every idea must include an economic explanation, mathematical reasoning, and test methodology. Example: hypothesis that momentum works better during low volatility, with 12-month return and VIX features, tested by walk-forward validation.

### ML Agent

Builds LightGBM, XGBoost, CatBoost, and neural-network predictive models. It owns training, validation, optimization, explainability, and the model registry. Require train/test separation, walk-forward testing, and feature importance. Never use future information or optimize only on test data.

### Strategy Agent

Converts model predictions into trade signals. A buy decision requires confidence above 0.8, acceptable risk, and a favorable regime. Never trade without Risk approval.

### Backtest Agent

Runs historical, walk-forward, and Monte Carlo tests, measuring Sharpe, Sortino, drawdown, CAGR, volatility, and turnover. Reject overfit strategies and unrealistic assumptions. Outputs PASS or FAIL with evidence.

### Risk Agent

Has veto power and evaluates position sizing, volatility, correlation, drawdown, and liquidity. Default limits: maximum position 2%, maximum drawdown 15%. Responses: APPROVE, REDUCE, REJECT, or HALT.

### Monitoring Agent

Monitors PnL, model drift, data/API failures, and latency. It alerts, pauses, or escalates as appropriate.

### Auditor Agent

Reviews code, data, experiments, models, and strategies. Reject leakage, missing tests, poor documentation, and unrealistic results. Outputs PASS, FAIL, or REQUEST_CHANGES.

## Development Order

1. Database, data ingestion, feature pipeline, backtesting engine.
2. ML pipeline, experiment tracking, strategy generation.
3. Risk engine and portfolio optimizer.
4. Agent orchestration.
5. Paper trading.

## Coding Rules

Before writing code: inspect existing files, explain the plan, create tests first, implement, run tests, and document changes. Never delete existing functionality, hardcode secrets, skip validation, or create untested trading logic.

A feature is complete only when code, passing tests, documentation, example usage, and logging exist.

## First Codex Command

Read this prompt, create the repository structure, and implement Phase 1 only: database schema, market-data ingestion interface, feature pipeline, and backtesting engine. Do not implement live trading. Write tests before implementation. On completion report files created, tests run, and remaining tasks.
