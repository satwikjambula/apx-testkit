"""Versioned research-document artifacts."""

from dataclasses import dataclass
from uuid import uuid4


@dataclass(frozen=True, slots=True)
class KnowledgeDocument:
    document_id: str
    category: str
    content: str

    @classmethod
    def create(cls, category: str, content: str) -> "KnowledgeDocument":
        return cls(f"KNOW-{uuid4()}", category, content)
