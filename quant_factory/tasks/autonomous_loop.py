"""Scheduled, observable research-loop coordinator."""

import logging
from typing import Protocol

from quant_factory.knowledge.documents import KnowledgeDocument
from quant_factory.knowledge.search import KnowledgeBase
from quant_factory.tasks.workflow import Workflow, WorkflowResult

logger = logging.getLogger(__name__)


class WorkflowRunner(Protocol):
    def run_workflow(self, workflow: Workflow) -> WorkflowResult: ...


class AutonomousResearchLoop:
    """Run a reviewed workflow and persist its outcome as institutional knowledge."""

    def __init__(self, workflow_runner: WorkflowRunner, knowledge_base: KnowledgeBase) -> None:
        self.workflow_runner = workflow_runner
        self.knowledge_base = knowledge_base

    def run_once(self, workflow: Workflow) -> str:
        result = self.workflow_runner.run_workflow(workflow)
        document = KnowledgeDocument.create("experiment", f"{workflow.name}: {result.status}")
        self.knowledge_base.add(document)
        logger.info("autonomous_research_loop_completed workflow=%s status=%s", workflow.name, result.status)
        return document.document_id
