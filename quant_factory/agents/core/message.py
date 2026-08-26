"""Message bus schema for inter-agent requests and decisions."""

from dataclasses import dataclass
from enum import StrEnum


class MessageType(StrEnum):
    REQUEST = "REQUEST"
    RESPONSE = "RESPONSE"
    REVIEW = "REVIEW"
    APPROVAL = "APPROVAL"
    ALERT = "ALERT"


@dataclass(frozen=True, slots=True)
class AgentMessage:
    sender: str
    receiver: str
    message_type: MessageType
    payload: dict[str, object]


class MessageBus:
    def __init__(self) -> None:
        self._messages: list[AgentMessage] = []

    def publish(self, message: AgentMessage) -> None:
        self._messages.append(message)

    def receive(self, receiver: str) -> tuple[AgentMessage, ...]:
        return tuple(message for message in self._messages if message.receiver == receiver)
