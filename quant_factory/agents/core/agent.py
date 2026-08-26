"""Configurable base agent with auditable task execution."""

from dataclasses import dataclass

from quant_factory.tasks.queue import ResearchTask


@dataclass(frozen=True, slots=True)
class AgentDefinition:
    name: str
    role: str
    mission: str
    responsibilities: tuple[str, ...]
    permissions: tuple[str, ...]
    restrictions: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class AgentReport:
    agent: str
    task_id: str
    status: str
    artifact: str


class BaseAgent:
    def __init__(self, definition: AgentDefinition) -> None:
        self.definition = definition
        self.inbox: list[object] = []

    @property
    def name(self) -> str:
        return self.definition.name

    def receive_task(self, task: ResearchTask) -> None:
        self.inbox.append(task)

    def execute(self, task: ResearchTask) -> AgentReport:
        return AgentReport(self.name, task.task_id, "COMPLETED", f"{self.name}:{task.task_type}")

    def create_report(self, task: ResearchTask) -> AgentReport:
        return self.execute(task)

    def request_review(self, artifact: str, reviewer: str) -> tuple[str, str]:
        return artifact, reviewer
