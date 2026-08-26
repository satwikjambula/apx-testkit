"""Coordinates deterministic research workflows without making trading decisions."""

import logging

from quant_factory.tasks.workflow import Workflow, WorkflowResult

logger = logging.getLogger(__name__)


class OrchestratorAgent:
    name = "OrchestratorAgent"
    role = "Manager"

    def run_workflow(self, workflow: Workflow) -> WorkflowResult:
        completed: list[str] = []
        for step in workflow.steps:
            completed.append(f"{step.agent}:{step.action}")
            logger.info("workflow_step_completed workflow=%s step=%s", workflow.name, completed[-1])
        return WorkflowResult("COMPLETED", tuple(completed))
