"""Classification and trading metric calculations."""

import numpy as np
from sklearn.metrics import accuracy_score, precision_score, recall_score, roc_auc_score


def prediction_metrics(targets: np.ndarray, predictions: np.ndarray, probabilities: np.ndarray) -> dict[str, float]:
    return {
        "accuracy": float(accuracy_score(targets, predictions)),
        "precision": float(precision_score(targets, predictions, zero_division=0)),
        "recall": float(recall_score(targets, predictions, zero_division=0)),
        "roc_auc": float(roc_auc_score(targets, probabilities)),
    }
