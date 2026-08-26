import numpy as np

from quant_factory.strategies.evaluation import StrategyEvaluator
from quant_factory.strategies.generator import StrategyGenerator, StrategyRule


def test_strategy_generator_applies_threshold_and_evaluation_reports_significance() -> None:
    signals = StrategyGenerator(StrategyRule(threshold=0.6)).generate([0.4, 0.6, 0.8])
    evaluation = StrategyEvaluator(seed=3, bootstrap_samples=200).evaluate(
        np.array([0.0, 0.01, 0.02]), np.array(signals)
    )

    assert signals == (0, 1, 1)
    assert evaluation.observations == 3
    assert evaluation.mean_return > 0
    assert 0 <= evaluation.bootstrap_positive_probability <= 1
