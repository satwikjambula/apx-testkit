"""Declarative research workflows."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class WorkflowStep:
    agent: str
    action: str


@dataclass(frozen=True, slots=True)
class Workflow:
    name: str
    steps: tuple[WorkflowStep, ...]


@dataclass(frozen=True, slots=True)
class WorkflowResult:
    status: str
    completed_steps: tuple[str, ...]
