from quant_factory.agents.orchestrator.orchestrator import OrchestratorAgent
from quant_factory.tasks.workflow import Workflow, WorkflowStep


def test_workflow_runs_in_dependency_order_and_records_failure() -> None:
    workflow = Workflow(
        "Momentum Discovery",
        (WorkflowStep("ResearchAgent", "hypothesis"), WorkflowStep("MLAgent", "train")),
    )
    orchestrator = OrchestratorAgent()
    result = orchestrator.run_workflow(workflow)

    assert result.completed_steps == ("ResearchAgent:hypothesis", "MLAgent:train")
    assert result.status == "COMPLETED"
