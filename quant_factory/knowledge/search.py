"""Simple deterministic keyword search over institutional memory."""

from quant_factory.knowledge.documents import KnowledgeDocument


class KnowledgeBase:
    def __init__(self) -> None:
        self._documents: list[KnowledgeDocument] = []

    def add(self, document: KnowledgeDocument) -> None:
        self._documents.append(document)

    def search(self, query: str) -> list[KnowledgeDocument]:
        terms = query.lower().split()
        return [document for document in self._documents if all(term in document.content.lower() or term in document.category.lower() for term in terms)]
