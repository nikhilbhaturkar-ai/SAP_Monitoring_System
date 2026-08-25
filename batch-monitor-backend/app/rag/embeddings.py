"""Embeddings factory.

Tries a local HuggingFace sentence-transformers model first (good quality,
matches the approved plan). Falls back to a dependency-free deterministic
hashing embedding if sentence-transformers / torch aren't installable in the
current Python environment, so RAG still works end-to-end without those
heavy native deps.
"""

import hashlib
import math
from typing import Protocol

from app.config import settings

_HASH_DIM = 384


class Embeddings(Protocol):
    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...
    def embed_query(self, text: str) -> list[float]: ...


class _HashingEmbeddings:
    """Pure-python bag-of-words hashing embedding. No external deps."""

    def _embed(self, text: str) -> list[float]:
        vec = [0.0] * _HASH_DIM
        for token in text.lower().split():
            h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
            idx = h % _HASH_DIM
            vec[idx] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)


_instance: Embeddings | None = None


def get_embeddings() -> Embeddings:
    global _instance
    if _instance is not None:
        return _instance

    if settings.EMBEDDINGS_IMPL == "local":
        try:
            from langchain_huggingface import HuggingFaceEmbeddings

            _instance = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
            return _instance
        except Exception:
            pass

    _instance = _HashingEmbeddings()
    return _instance
