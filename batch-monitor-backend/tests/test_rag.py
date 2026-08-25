from app.rag.ingest import ensure_ingested
from app.rag.vectorstore import get_vectorstore


def test_ingest_and_retrieve_lock_table_doc():
    ensure_ingested()
    store = get_vectorstore()
    results = store.similarity_search("lock table timeout enqueue", k=3)
    assert len(results) > 0
    titles = " ".join(r["title"] for r in results)
    assert "Lock Table" in titles or "lock" in titles.lower()
