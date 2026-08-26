"""Local persistent memory plus an embedding-store protocol for production backends."""

from typing import Protocol

import duckdb


class VectorMemory(Protocol):
    def add(self, document: str, embedding: list[float]) -> None: ...

    def search(self, embedding: list[float], limit: int = 10) -> list[str]: ...


class AgentMemoryStore:
    def __init__(self, database_path: str | object) -> None:
        self.database_path = str(database_path)
        with self._connect() as connection:
            connection.execute("CREATE TABLE IF NOT EXISTS agent_memory (agent VARCHAR, kind VARCHAR, content VARCHAR)")

    def _connect(self) -> duckdb.DuckDBPyConnection:
        return duckdb.connect(self.database_path)

    def remember(self, agent: str, kind: str, content: str) -> None:
        with self._connect() as connection:
            connection.execute("INSERT INTO agent_memory VALUES (?, ?, ?)", [agent, kind, content])

    def recall(self, agent: str, query: str) -> list[str]:
        with self._connect() as connection:
            rows = connection.execute("SELECT content FROM agent_memory WHERE agent = ? AND lower(content) LIKE ?", [agent, f"%{query.lower()}%"]).fetchall()
        return [row[0] for row in rows]
