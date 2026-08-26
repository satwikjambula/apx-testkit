"""Typed messages exchanged among future research agents."""

from dataclasses import dataclass
from enum import StrEnum


class MessageStatus(StrEnum):
    REQUEST = "REQUEST"
    RESPONSE = "RESPONSE"
    REVIEW = "REVIEW"
    APPROVAL = "APPROVAL"
    ALERT = "ALERT"


@dataclass(frozen=True, slots=True)
class AgentMessage:
    sender: str
    receiver: str
    task: str
    artifact: str
    status: MessageStatus
    confidence: float

    def __post_init__(self) -> None:
        if not 0 <= self.confidence <= 1:
            raise ValueError("confidence must be between 0 and 1")

    def to_dict(self) -> dict[str, object]:
        return {"sender": self.sender, "receiver": self.receiver, "task": self.task, "artifact": self.artifact, "status": self.status.value, "confidence": self.confidence}
