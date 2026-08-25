from langchain_core.messages import HumanMessage, SystemMessage

from app.graph.state import InvestigationState
from app.llm.groq_client import get_chat_model
from app.models.schemas import JobRecord
from app.prompts.summarize_incident import SYSTEM_PROMPT, build_user_prompt


async def summarize_incident(state: InvestigationState) -> dict:
    model = get_chat_model("summarize_incident")
    jobs = [JobRecord(**j) for j in state["failed_jobs"]]
    recurring = state.get("recurring_errors", [])
    retrieved_docs = state.get("_retrieved_docs", [])

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=build_user_prompt(jobs, recurring, retrieved_docs)),
    ]
    response = await model.ainvoke(messages)

    return {
        "incident_summary": response.content,
        "progress_log": ["Generated incident summary"],
    }
