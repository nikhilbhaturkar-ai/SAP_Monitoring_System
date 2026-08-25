import asyncio

from langchain_core.messages import HumanMessage, SystemMessage

from app.graph.state import InvestigationState
from app.llm.groq_client import get_chat_model
from app.models.schemas import JobRecord
from app.prompts.analyze_logs import SYSTEM_PROMPT, build_user_prompt


async def _analyze_one(model, job: JobRecord) -> str:
    messages = [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=build_user_prompt(job))]
    response = await model.ainvoke(messages)
    return response.content


async def analyze_logs(state: InvestigationState) -> dict:
    model = get_chat_model("analyze_logs")
    jobs = [JobRecord(**j) for j in state["failed_jobs"]]

    analyses = await asyncio.gather(*(_analyze_one(model, job) for job in jobs))
    for job, analysis in zip(jobs, analyses):
        job.log_analysis = analysis

    return {
        "failed_jobs": [job.model_dump() for job in jobs],
        "progress_log": [f"Analyzed logs for {len(jobs)} jobs"],
    }
