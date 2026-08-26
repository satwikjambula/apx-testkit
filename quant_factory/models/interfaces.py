"""Stable model-backend interfaces; optional frameworks may implement these protocols."""

from typing import Protocol

import numpy as np


class PredictiveModel(Protocol):
    def fit(self, features: np.ndarray, targets: np.ndarray) -> object: ...

    def predict_proba(self, features: np.ndarray) -> np.ndarray: ...


class TorchModelFactory(Protocol):
    """PyTorch integration contract; implementation is intentionally deferred."""

    def create(self, input_dimensions: int) -> PredictiveModel: ...
