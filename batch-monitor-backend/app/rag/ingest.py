"""Idempotent ingestion of the seed known-issues docs into the vector store.

Run standalone with `python -m app.rag.ingest`, or call ensure_ingested() at
app startup.
"""

import hashlib
import os

from app.rag.vectorstore import get_vectorstore

_SEED_DIR = os.path.join(os.path.dirname(__file__), "seed_data", "known_issues")
_CHUNK_SIZE = 500
_CHUNK_OVERLAP = 50


def _chunk_text(text: str, size: int = _CHUNK_SIZE, overlap: int = _CHUNK_OVERLAP) -> list[str]:
    words = text.split()
    if not words:
        return []
    chunks = []
    step = max(size - overlap, 1)
    for start in range(0, len(words), step):
        chunk = " ".join(words[start : start + size])
        if chunk:
            chunks.append(chunk)
        if start + size >= len(words):
            break
    return chunks


def ensure_ingested() -> int:
    store = get_vectorstore()

    ids, texts, metadatas = [], [], []
    for filename in sorted(os.listdir(_SEED_DIR)):
        if not filename.endswith(".md"):
            continue
        path = os.path.join(_SEED_DIR, filename)
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        title = content.splitlines()[0].lstrip("# ").strip()
        content_hash = hashlib.md5(content.encode("utf-8")).hexdigest()[:8]

        for i, chunk in enumerate(_chunk_text(content)):
            ids.append(f"{filename}::{content_hash}::{i}")
            texts.append(chunk)
            metadatas.append({"title": title, "source": filename})

    if ids:
        store.add_documents(ids, texts, metadatas)

    return store.count()


if __name__ == "__main__":
    total = ensure_ingested()
    print(f"Ingested seed docs. Vector store now has {total} chunks.")
