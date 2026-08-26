"""Dependency-aware task state machine."""

from dataclasses import dataclass
from enum import StrEnum
from uuid import uuid4


class TaskStatus(StrEnum):
    CREATED = "CREATED"
    ASSIGNED = "ASSIGNED"
    RUNNING = "RUNNING"
    REVIEW = "REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    COMPLETED = "COMPLETED"


@dataclass(frozen=True, slots=True)
class ResearchTask:
    task_id: str
    task_type: str
    owner: str | None
    dependencies: tuple[str, ...]
    status: TaskStatus
    priority: str = "NORMAL"


class TaskQueue:
    def __init__(self) -> None:
        self._tasks: dict[str, ResearchTask] = {}

    def create(self, task_type: str, *, owner: str | None = None, dependencies: tuple[str, ...] = (), priority: str = "NORMAL") -> ResearchTask:
        task = ResearchTask(f"TASK-{uuid4()}", task_type, owner, dependencies, TaskStatus.CREATED, priority)
        self._tasks[task.task_id] = task
        return task

    def get(self, task_id: str) -> ResearchTask:
        return self._tasks[task_id]

    def ready(self, task_id: str) -> bool:
        task = self.get(task_id)
        return all(self.get(dependency).status == TaskStatus.COMPLETED for dependency in task.dependencies)

    def assign(self, task_id: str, owner: str) -> ResearchTask:
        task = self.get(task_id)
        if not self.ready(task_id):
            raise ValueError("Task dependencies are incomplete")
        return self._replace(task, owner=owner, status=TaskStatus.ASSIGNED)

    def complete(self, task_id: str) -> ResearchTask:
        task = self.get(task_id)
        return self._replace(task, status=TaskStatus.COMPLETED)

    def reject(self, task_id: str) -> ResearchTask:
        return self._replace(self.get(task_id), status=TaskStatus.REJECTED)

    def _replace(self, task: ResearchTask, **changes: object) -> ResearchTask:
        updated = ResearchTask(**{field: getattr(task, field) for field in task.__dataclass_fields__} | changes)
        self._tasks[task.task_id] = updated
        return updated
