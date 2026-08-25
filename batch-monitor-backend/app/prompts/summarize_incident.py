SYSTEM_PROMPT = (
    "You are an SAP BASIS incident manager. Write a concise incident summary "
    "(4-8 sentences) covering: how many jobs failed, the main recurring error "
    "patterns, and the most likely root causes, referencing known-issue "
    "documentation where relevant. Write in plain prose, no markdown headers."
)


def build_user_prompt(jobs, recurring_errors, retrieved_docs) -> str:
    job_lines = [
        f"- {j.job_name} ({j.job_id}): {j.error_code} — {j.log_analysis}" for j in jobs
    ]
    recurring_lines = [
        f"- {r['pattern']} (count={r['count']}, jobs={r['job_ids']})"
        for r in recurring_errors
    ]
    doc_lines = [f"- {d['title']}: {d['text'][:200]}" for d in retrieved_docs]
    return (
        "Failed jobs:\n"
        + "\n".join(job_lines)
        + "\n\nRecurring error patterns:\n"
        + ("\n".join(recurring_lines) if recurring_lines else "None identified.")
        + "\n\nRelevant known-issue documentation:\n"
        + ("\n".join(doc_lines) if doc_lines else "None found.")
        + "\n\nWrite the incident summary."
    )
