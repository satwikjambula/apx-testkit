"""Deterministic feature selection after validation."""

from quant_factory.features.validator import FeatureValidation


def approved_features(reports: dict[str, FeatureValidation]) -> tuple[str, ...]:
    return tuple(name for name, report in reports.items() if report.status == "APPROVED")
