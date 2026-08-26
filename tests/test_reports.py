from pathlib import Path

from quant_factory.experiments.reporting import ResearchReportGenerator
from quant_factory.experiments.tracking import ExperimentRun


def test_report_includes_reproducibility_metadata(tmp_path: Path) -> None:
    run = ExperimentRun("run-1", "test", "hash", "FINISHED", {"sharpe": 1.1}, ("model.pkl",))
    report = ResearchReportGenerator().write(run, tmp_path)

    assert "Configuration hash: `hash`" in report.read_text()
    assert "sharpe" in report.read_text()
