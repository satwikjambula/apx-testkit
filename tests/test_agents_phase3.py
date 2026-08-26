from pathlib import Path

import pytest

from quant_factory.agents.core.agent import AgentDefinition, BaseAgent
from quant_factory.agents.core.memory import AgentMemoryStore
from quant_factory.agents.core.message import AgentMessage, MessageType
from quant_factory.agents.core.registry import AgentRegistry
from quant_factory.approvals.review import ReviewDecision, ReviewService
from quant_factory.tasks.queue import TaskQueue, TaskStatus


def agent(name: str) -> BaseAgent:
    return BaseAgent(AgentDefinition(name, "Researcher", "Test", (), (), ("cannot approve own work",)))


def test_agent_registration_messaging_task_execution_and_memory(tmp_path: Path) -> None:
    registry = AgentRegistry()
    research = agent("ResearchAgent")
    registry.register(research)
    queue = TaskQueue()
    task = queue.create("HYPOTHESIS", owner="ResearchAgent")
    queue.assign(task.task_id, "ResearchAgent")
    report = research.execute(queue.get(task.task_id))
    queue.complete(task.task_id)
    memory = AgentMemoryStore(tmp_path / "memory.duckdb")
    memory.remember("ResearchAgent", "long_term", "Momentum needs a risk review")

    assert registry.find("ResearchAgent") is research
    assert report.status == "COMPLETED"
    assert queue.get(task.task_id).status == TaskStatus.COMPLETED
    assert memory.recall("ResearchAgent", "Momentum") == ["Momentum needs a risk review"]
    assert AgentMessage("ResearchAgent", "MLAgent", MessageType.REQUEST, {"task": task.task_id}).receiver == "MLAgent"


def test_dependencies_reviews_and_vetoes_are_enforced() -> None:
    queue = TaskQueue()
    dependency = queue.create("FEATURE")
    task = queue.create("MODEL", dependencies=(dependency.task_id,))
    assert not queue.ready(task.task_id)
    queue.complete(dependency.task_id)
    assert queue.ready(task.task_id)

    reviews = ReviewService()
    with pytest.raises(PermissionError, match="own"):
        reviews.review("MODEL-1", creator="MLAgent", reviewer="MLAgent", decision=ReviewDecision.APPROVE, reason="ok")
    rejected = reviews.review("MODEL-1", creator="MLAgent", reviewer="RiskAgent", decision=ReviewDecision.REJECT, reason="drawdown")
    assert rejected.decision == ReviewDecision.REJECT
    assert reviews.is_vetoed("MODEL-1")
