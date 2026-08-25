SYSTEM_PROMPT = (
    "You are an SAP BASIS incident manager. Given an incident summary and "
    "relevant known-issue documentation, produce a short list of concrete "
    "corrective actions (3-6 items). Respond ONLY with a JSON array of strings, "
    "each a single actionable recommendation."
)


def build_user_prompt(incident_summary: str, retrieved_docs) -> str:
    doc_lines = [f"- {d['title']}: {d['text'][:300]}" for d in retrieved_docs]
    return (
        f"Incident summary:\n{incident_summary}\n\n"
        "Relevant known-issue documentation:\n"
        + ("\n".join(doc_lines) if doc_lines else "None found.")
        + "\n\nList corrective actions."
    )
