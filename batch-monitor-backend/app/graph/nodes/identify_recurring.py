import json
import re

from langchain_core.messages import HumanMessage, SystemMessage

from app.graph.state import InvestigationState
from app.llm.groq_client import get_chat_model
from app.models.schemas import JobRecord
from app.prompts.identify_recurring import SYSTEM_PROMPT, build_user_prompt


def _extract_json_array(text: str) -> list:
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if not match:
        return []
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return []


async def identify_recurring(state: InvestigationState) -> dict:
    jobs = [JobRecord(**j) for j in state["failed_jobs"]]

    # Fallback grouping by error_code guarantees a non-empty result even if the
    # LLM response can't be parsed as JSON.
    fallback: dict[str, list[str]] = {}
    for job in jobs:
        fallback.setdefault(job.error_code, []).append(job.job_id)
    fallback_patterns = [
        {"pattern": code, "count": len(ids), "job_ids": ids}
        for code, ids in fallback.items()
        if len(ids) >= 1
    ]

    model = get_chat_model("identify_recurring")
    messages = [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=build_user_prompt(jobs))]
    response = await model.ainvoke(messages)
    parsed = _extract_json_array(response.content)

    recurring = parsed if parsed else fallback_patterns

    return {
        "recurring_errors": recurring,
        "progress_log": [f"Identified {len(recurring)} recurring error pattern(s)"],
    }
