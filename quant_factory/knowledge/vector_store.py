"""Vector-store interface for PostgreSQL/pgvector-backed production retrieval."""

from typing import Protocol


class VectorStore(Protocol):
    def upsert(self, identifier: str, text: str, embedding: list[float]) -> None: ...

    def query(self, embedding: list[float], limit: int = 10) -> list[str]: ...
