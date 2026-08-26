"""Cross-asset, walk-forward quantitative research and reporting."""

from __future__ import annotations

import argparse
import html
import json
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

import numpy as np

from quant_factory.backtesting.engine import BacktestConfig, BacktestEngine, BacktestResult
from quant_factory.local_model import load_csv, moving_average_signals


@dataclass(frozen=True, slots=True)
class StrategyConfig:
    family: str
    fast: int
    slow: int
    signal: int = 0

    @property
    def label(self) -> str:
        suffix = f"/{self.signal}" if self.signal else ""
        return f"{self.family.upper()} {self.fast}/{self.slow}{suffix}"


@dataclass(frozen=True, slots=True)
class FoldResult:
    fold: int
    train_start: str
    train_end: str
    test_start: str
    test_end: str
    selected: str
    strategy_return: float
    benchmark_return: float
    excess_return: float
    sharpe: float
    max_drawdown: float
    trades: int


@dataclass(frozen=True, slots=True)
class AssetResult:
    symbol: str
    folds: tuple[FoldResult, ...]
    compounded_strategy_return: float
    compounded_benchmark_return: float
    excess_return: float
    mean_sharpe: float
    worst_drawdown: float
    trades: int
    positive_folds: int


@dataclass(frozen=True, slots=True)
class ResearchReport:
    fee_bps: float
    slippage_bps: float
    assets: tuple[AssetResult, ...]


def _ema(values: np.ndarray, span: int) -> np.ndarray:
    result = np.empty_like(values, dtype=float)
    result[0] = values[0]
    alpha = 2.0 / (span + 1)
    for index in range(1, len(values)):
        result[index] = alpha * values[index] + (1 - alpha) * result[index - 1]
    return result


def macd_signals(
    closes: Sequence[float], fast: int, slow: int, signal: int
) -> tuple[int, ...]:
    if not (0 < fast < slow and signal > 0):
        raise ValueError("MACD windows must satisfy 0 < fast < slow and signal > 0")
    values = np.asarray(closes, dtype=float)
    macd = _ema(values, fast) - _ema(values, slow)
    signal_line = _ema(macd, signal)
    warmup = slow + signal - 1
    output = np.where((macd > signal_line) & (macd > 0), 1, 0)
    output[: min(warmup, len(output))] = 0
    return tuple(output.tolist())


def default_grid() -> tuple[StrategyConfig, ...]:
    ma = (
        StrategyConfig("ma", fast, slow)
        for fast in range(5, 51, 5)
        for slow in range(20, 201, 20)
        if fast < slow
    )
    macd = (
        StrategyConfig("macd", fast, slow, signal)
        for fast in (5, 8, 12, 16, 20)
        for slow in (20, 26, 35, 50, 75)
        for signal in (5, 9, 12)
        if fast < slow
    )
    return (*ma, *macd)


def _signals(closes: Sequence[float], config: StrategyConfig) -> tuple[int, ...]:
    if config.family == "ma":
        return moving_average_signals(closes, config.fast, config.slow)
    return macd_signals(closes, config.fast, config.slow, config.signal)


def _total_return(result: BacktestResult) -> float:
    return result.equity_curve[-1] / result.equity_curve[0] - 1


class RobustQuantResearch:
    def __init__(
        self,
        *,
        grid: Sequence[StrategyConfig] | None = None,
        folds: int = 4,
        minimum_train_bars: int = 252,
        fee_bps: float = 1.0,
        slippage_bps: float = 2.0,
    ) -> None:
        if folds < 2:
            raise ValueError("folds must be at least 2")
        self.grid = tuple(grid or default_grid())
        self.folds = folds
        self.minimum_train_bars = minimum_train_bars
        self.engine = BacktestEngine(
            BacktestConfig(fee_bps=fee_bps, slippage_bps=slippage_bps)
        )
        self.fee_bps = fee_bps
        self.slippage_bps = slippage_bps

    def run_asset(
        self,
        symbol: str,
        timestamps: Sequence[datetime],
        opens: Sequence[float],
        closes: Sequence[float],
    ) -> tuple[AssetResult, dict[StrategyConfig, float]]:
        if len(closes) < self.minimum_train_bars + self.folds * 20:
            raise ValueError(f"{symbol} has too few bars for walk-forward validation")
        signal_cache = {config: _signals(closes, config) for config in self.grid}
        first_test = max(self.minimum_train_bars, len(closes) // (self.folds + 1))
        boundaries = np.linspace(first_test, len(closes), self.folds + 1, dtype=int)
        folds: list[FoldResult] = []
        surface: dict[StrategyConfig, list[float]] = {config: [] for config in self.grid}

        for fold_index in range(self.folds):
            test_start, test_end = int(boundaries[fold_index]), int(boundaries[fold_index + 1])
            scores: list[tuple[float, StrategyConfig]] = []
            for config in self.grid:
                train = self.engine.run(
                    timestamps[:test_start], opens[:test_start], closes[:test_start],
                    signal_cache[config][:test_start],
                )
                # Sharpe is the selection statistic; parameter results remain
                # visible in the heatmap instead of only exposing the winner.
                surface[config].append(train.sharpe)
                scores.append((train.sharpe, config))
            _, selected = max(
                scores,
                key=lambda item: (item[0], -item[1].slow, -item[1].fast, -item[1].signal),
            )
            edge = test_start - 1
            strategy = self.engine.run(
                timestamps[edge:test_end], opens[edge:test_end], closes[edge:test_end],
                signal_cache[selected][edge:test_end],
            )
            benchmark = self.engine.run(
                timestamps[edge:test_end], opens[edge:test_end], closes[edge:test_end],
                [1] * (test_end - edge),
            )
            strategy_return = _total_return(strategy)
            benchmark_return = _total_return(benchmark)
            folds.append(
                FoldResult(
                    fold=fold_index + 1,
                    train_start=timestamps[0].date().isoformat(),
                    train_end=timestamps[test_start - 1].date().isoformat(),
                    test_start=timestamps[test_start].date().isoformat(),
                    test_end=timestamps[test_end - 1].date().isoformat(),
                    selected=selected.label,
                    strategy_return=strategy_return,
                    benchmark_return=benchmark_return,
                    excess_return=strategy_return - benchmark_return,
                    sharpe=strategy.sharpe,
                    max_drawdown=strategy.max_drawdown,
                    trades=len(strategy.trades),
                )
            )

        strategy_total = float(np.prod([1 + fold.strategy_return for fold in folds]) - 1)
        benchmark_total = float(np.prod([1 + fold.benchmark_return for fold in folds]) - 1)
        result = AssetResult(
            symbol=symbol,
            folds=tuple(folds),
            compounded_strategy_return=strategy_total,
            compounded_benchmark_return=benchmark_total,
            excess_return=strategy_total - benchmark_total,
            mean_sharpe=float(np.mean([fold.sharpe for fold in folds])),
            worst_drawdown=min(fold.max_drawdown for fold in folds),
            trades=sum(fold.trades for fold in folds),
            positive_folds=sum(fold.strategy_return > 0 for fold in folds),
        )
        mean_surface = {config: float(np.mean(values)) for config, values in surface.items()}
        return result, mean_surface

    def run(
        self,
        datasets: dict[str, tuple[list[datetime], list[float], list[float]]],
        output_dir: Path,
    ) -> ResearchReport:
        output_dir.mkdir(parents=True, exist_ok=True)
        results: list[AssetResult] = []
        for symbol, dataset in datasets.items():
            result, surface = self.run_asset(symbol, *dataset)
            results.append(result)
            _write_heatmap(output_dir / f"{symbol.lower()}-robustness.html", symbol, surface)
        ranked = tuple(
            sorted(
                results,
                key=lambda item: (item.excess_return, item.mean_sharpe, item.positive_folds),
                reverse=True,
            )
        )
        report = ResearchReport(self.fee_bps, self.slippage_bps, ranked)
        (output_dir / "report.json").write_text(json.dumps(asdict(report), indent=2) + "\n")
        _write_markdown(output_dir / "ranking.md", report)
        return report


def _color(value: float, low: float, high: float) -> str:
    ratio = 0.5 if high == low else (value - low) / (high - low)
    red = int(220 * (1 - ratio) + 45 * ratio)
    green = int(65 * (1 - ratio) + 165 * ratio)
    blue = int(65 * (1 - ratio) + 95 * ratio)
    return f"rgb({red},{green},{blue})"


def _write_heatmap(path: Path, symbol: str, surface: dict[StrategyConfig, float]) -> None:
    values = list(surface.values())
    low, high = min(values), max(values)
    rows = "\n".join(
        f'<tr><td>{html.escape(config.label)}</td><td style="background:{_color(score, low, high)}">{score:.3f}</td></tr>'
        for config, score in sorted(surface.items(), key=lambda item: (item[0].family, item[0].slow, item[0].fast, item[0].signal))
    )
    path.write_text(
        "<!doctype html><meta charset='utf-8'><title>Robustness</title>"
        f"<h1>{html.escape(symbol)} parameter robustness</h1>"
        "<p>Mean expanding-window training Sharpe. Green is stronger; red is weaker.</p>"
        "<table><thead><tr><th>Configuration</th><th>Mean Sharpe</th></tr></thead>"
        f"<tbody>{rows}</tbody></table>"
        "<style>body{font:14px system-ui;max-width:800px;margin:40px auto}table{border-collapse:collapse;width:100%}td,th{padding:7px;border:1px solid #ccc;text-align:left}td:last-child{color:white;font-weight:700}</style>\n"
    )


def _write_markdown(path: Path, report: ResearchReport) -> None:
    lines = [
        "# Ranked cross-asset research report",
        "",
        f"Costs: {report.fee_bps:.1f} bps fees + {report.slippage_bps:.1f} bps slippage per position change.",
        "",
        "| Rank | Asset | Strategy return | Buy & hold | Excess | Mean Sharpe | Worst drawdown | Trades | Positive folds |",
        "|---:|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for rank, asset in enumerate(report.assets, 1):
        lines.append(
            f"| {rank} | {asset.symbol} | {asset.compounded_strategy_return:.1%} | "
            f"{asset.compounded_benchmark_return:.1%} | {asset.excess_return:.1%} | "
            f"{asset.mean_sharpe:.2f} | {asset.worst_drawdown:.1%} | {asset.trades} | "
            f"{asset.positive_folds}/{len(asset.folds)} |"
        )
    lines.extend(["", "## Walk-forward folds", ""])
    for asset in report.assets:
        lines.extend([f"### {asset.symbol}", ""])
        for fold in asset.folds:
            lines.append(
                f"- Fold {fold.fold} ({fold.test_start} to {fold.test_end}): {fold.selected}; "
                f"strategy {fold.strategy_return:.1%}, buy-and-hold {fold.benchmark_return:.1%}, "
                f"Sharpe {fold.sharpe:.2f}."
            )
        lines.append("")
    path.write_text("\n".join(lines) + "\n")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run cross-asset walk-forward research")
    parser.add_argument(
        "datasets", nargs="+", metavar="SYMBOL=CSV", help="for example AAPL=prices_aapl.csv"
    )
    parser.add_argument("--output", type=Path, default=Path("quant-report"))
    parser.add_argument("--fee-bps", type=float, default=1.0)
    parser.add_argument("--slippage-bps", type=float, default=2.0)
    parser.add_argument("--folds", type=int, default=4)
    args = parser.parse_args(argv)
    datasets: dict[str, tuple[list[datetime], list[float], list[float]]] = {}
    for value in args.datasets:
        if "=" not in value:
            parser.error(f"invalid dataset {value!r}; expected SYMBOL=CSV")
        symbol, path = value.split("=", 1)
        datasets[symbol.upper()] = load_csv(Path(path))
    research = RobustQuantResearch(
        folds=args.folds, fee_bps=args.fee_bps, slippage_bps=args.slippage_bps
    )
    report = research.run(datasets, args.output)
    print(json.dumps(asdict(report), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
