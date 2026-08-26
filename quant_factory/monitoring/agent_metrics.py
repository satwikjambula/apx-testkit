"""Agent contribution metrics."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class AgentMetrics:
    agent: str
    tasks_completed: int
    success_rate: float
    average_completion_seconds: float
    rejection_rate: float
    contribution_quality: float


class AgentPerformanceTracker:
    def __init__(self) -> None:
        self._completed: dict[str, int] = {}
        self._successful: dict[str, int] = {}

    def record_task(self, agent: str, *, successful: bool) -> None:
        self._completed[agent] = self._completed.get(agent, 0) + 1
        self._successful[agent] = self._successful.get(agent, 0) + int(successful)

    def snapshot(self, agent: str) -> AgentMetrics:
        completed = self._completed.get(agent, 0)
        success_rate = self._successful.get(agent, 0) / completed if completed else 0.0
        return AgentMetrics(agent, completed, success_rate, 0.0, 1 - success_rate if completed else 0.0, success_rate)
