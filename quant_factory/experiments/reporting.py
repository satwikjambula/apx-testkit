"""Human-readable reports produced from stored experiment facts."""

from pathlib import Path

from quant_factory.experiments.tracking import ExperimentRun


class ResearchReportGenerator:
    def write(self, run: ExperimentRun, output_directory: Path) -> Path:
        output_directory.mkdir(parents=True, exist_ok=True)
        report = output_directory / f"{run.run_id}.md"
        metrics = "\n".join(f"- {name}: {value}" for name, value in sorted(run.metrics.items()))
        artifacts = "\n".join(f"- {path}" for path in run.artifacts) or "- None"
        report.write_text(
            f"# Research report: {run.name}\n\nStatus: {run.status}\n\n"
            f"Configuration hash: `{run.config_hash}`\n\n## Metrics\n{metrics}\n\n## Artifacts\n{artifacts}\n"
        )
        return report
