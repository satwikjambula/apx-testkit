"""In-process registry of available specialist agents."""

from dataclasses import dataclass

from quant_factory.agents.core.agent import BaseAgent


@dataclass(slots=True)
class AgentState:
    agent: BaseAgent
    status: str = "AVAILABLE"
    current_task: str | None = None


class AgentRegistry:
    def __init__(self) -> None:
        self._agents: dict[str, AgentState] = {}

    def register(self, agent: BaseAgent) -> None:
        if agent.name in self._agents:
            raise ValueError(f"Agent already registered: {agent.name}")
        self._agents[agent.name] = AgentState(agent)

    def find(self, name: str) -> BaseAgent:
        return self._agents[name].agent

    def set_task(self, name: str, task_id: str | None) -> None:
        state = self._agents[name]
        state.current_task, state.status = task_id, "BUSY" if task_id else "AVAILABLE"
