from app.graph.state import InvestigationState
from app.models.schemas import JobRecord
from app.prompts.correlate_rag import build_query
from app.rag.vectorstore import get_vectorstore


async def correlate_rag(state: InvestigationState) -> dict:
    store = get_vectorstore()
    jobs = [JobRecord(**j) for j in state["failed_jobs"]]
    recurring = state.get("recurring_errors", [])

    all_retrieved: list[dict] = []
    job_by_id = {j.job_id: j for j in jobs}

    for pattern in recurring:
        query = build_query(pattern.get("pattern", ""))
        docs = store.similarity_search(query, k=3)
        all_retrieved.extend(docs)
        titles = [d["title"] for d in docs]
        for job_id in pattern.get("job_ids", []):
            job = job_by_id.get(job_id)
            if job:
                job.matched_known_issues = titles
                job.retrieved_docs = docs

    # dedupe retrieved docs by title, keep first occurrence
    seen = set()
    deduped = []
    for d in all_retrieved:
        if d["title"] not in seen:
            seen.add(d["title"])
            deduped.append(d)

    return {
        "failed_jobs": [job.model_dump() for job in jobs],
        "progress_log": [f"Correlated recurring errors with {len(deduped)} known-issue doc(s)"],
        "_retrieved_docs": deduped,
    }
