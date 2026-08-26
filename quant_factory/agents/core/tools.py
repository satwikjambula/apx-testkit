"""Capability-gated tool descriptors for specialist agents."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class AgentTool:
    name: str
    required_permission: str


def permitted(tool: AgentTool, permissions: tuple[str, ...]) -> bool:
    return tool.required_permission in permissions
