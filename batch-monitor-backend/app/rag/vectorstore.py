"""Vector store factory.

Tries Chroma (persistent, on-disk) first, per the approved plan. Falls back to
a small dependency-free in-memory cosine-similarity store (persisted as JSON)
if chromadb isn't installable in the current Python environment.
"""

import json
import math
import os
from typing import Protocol

from app.config import settings

_COLLECTION_NAME = "sap_known_issues"


class VectorStore(Protocol):
    def add_documents(self, ids: list[str], texts: list[str], metadatas: list[dict]) -> None: ...
    def similarity_search(self, query: str, k: int = 3) -> list[dict]: ...
    def count(self) -> int: ...


class _ChromaStore:
    def __init__(self):
        import chromadb

        from app.rag.embeddings import get_embeddings

        self._embeddings = get_embeddings()
        client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
        self._collection = client.get_or_create_collection(_COLLECTION_NAME)

    def add_documents(self, ids: list[str], texts: list[str], metadatas: list[dict]) -> None:
        embeddings = self._embeddings.embed_documents(texts)
        self._collection.upsert(ids=ids, documents=texts, metadatas=metadatas, embeddings=embeddings)

    def similarity_search(self, query: str, k: int = 3) -> list[dict]:
        query_embedding = self._embeddings.embed_query(query)
        result = self._collection.query(query_embeddings=[query_embedding], n_results=k)
        docs = []
        for text, meta in zip(result.get("documents", [[]])[0], result.get("metadatas", [[]])[0]):
            docs.append({"text": text, "title": meta.get("title", ""), "source": meta.get("source", "")})
        return docs

    def count(self) -> int:
        return self._collection.count()


class _InMemoryStore:
    def __init__(self):
        from app.rag.embeddings import get_embeddings

        self._embeddings = get_embeddings()
        self._path = os.path.join(settings.CHROMA_PERSIST_DIR, "in_memory_store.json")
        os.makedirs(settings.CHROMA_PERSIST_DIR, exist_ok=True)
        self._records: list[dict] = []
        if os.path.exists(self._path):
            with open(self._path, "r", encoding="utf-8") as f:
                self._records = json.load(f)

    def _save(self) -> None:
        with open(self._path, "w", encoding="utf-8") as f:
            json.dump(self._records, f)

    def add_documents(self, ids: list[str], texts: list[str], metadatas: list[dict]) -> None:
        embeddings = self._embeddings.embed_documents(texts)
        existing_ids = {r["id"] for r in self._records}
        for doc_id, text, meta, emb in zip(ids, texts, metadatas, embeddings):
            record = {"id": doc_id, "text": text, "metadata": meta, "embedding": emb}
            if doc_id in existing_ids:
                self._records = [r for r in self._records if r["id"] != doc_id]
            self._records.append(record)
        self._save()

    @staticmethod
    def _cosine(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a)) or 1.0
        norm_b = math.sqrt(sum(y * y for y in b)) or 1.0
        return dot / (norm_a * norm_b)

    def similarity_search(self, query: str, k: int = 3) -> list[dict]:
        query_embedding = self._embeddings.embed_query(query)
        scored = [
            (self._cosine(query_embedding, r["embedding"]), r) for r in self._records
        ]
        scored.sort(key=lambda pair: pair[0], reverse=True)
        return [
            {
                "text": r["text"],
                "title": r["metadata"].get("title", ""),
                "source": r["metadata"].get("source", ""),
            }
            for _, r in scored[:k]
        ]

    def count(self) -> int:
        return len(self._records)


_instance: VectorStore | None = None


def get_vectorstore() -> VectorStore:
    global _instance
    if _instance is not None:
        return _instance

    if settings.VECTORSTORE_IMPL == "chroma":
        try:
            _instance = _ChromaStore()
            return _instance
        except Exception:
            pass

    _instance = _InMemoryStore()
    return _instance
