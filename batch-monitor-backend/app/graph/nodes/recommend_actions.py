import json
import re

from langchain_core.messages import HumanMessage, SystemMessage

from app.graph.state import InvestigationState
from app.llm.groq_client import get_chat_model
from app.prompts.recommend_actions import SYSTEM_PROMPT, build_user_prompt


def _extract_json_array(text: str) -> list:
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if not match:
        return []
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return []


async def recommend_actions(state: InvestigationState) -> dict:
    model = get_chat_model("recommend_actions")
    summary = state.get("incident_summary", "")
    retrieved_docs = state.get("_retrieved_docs", [])

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=build_user_prompt(summary, retrieved_docs)),
    ]
    response = await model.ainvoke(messages)
    actions = _extract_json_array(response.content)
    if not actions:
        actions = [response.content.strip()]

    return {
        "recommended_actions": actions,
        "status": "awaiting_action",
        "progress_log": [f"Recommended {len(actions)} corrective action(s)"],
    }
