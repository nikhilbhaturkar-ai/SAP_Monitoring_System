import asyncio

from fastapi import APIRouter, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage

from app.llm.groq_client import get_chat_model
from app.models.schemas import AnalyzeErrorRequest
from app.prompts.analyze_error import SYSTEM_PROMPT, build_user_prompt, extract_section
from app.rag.vectorstore import get_vectorstore

router = APIRouter(prefix="/analyze-error", tags=["analyze"])


@router.post("")
async def analyze_error(payload: AnalyzeErrorRequest):
    if not payload.error.strip():
        raise HTTPException(status_code=422, detail="error must not be empty")

    # Ground the answer in the known-issue knowledge base; a failed lookup
    # shouldn't block the analysis itself.
    try:
        docs = await asyncio.to_thread(get_vectorstore().similarity_search, payload.error, 3)
    except Exception:  # noqa: BLE001
        docs = []

    model = get_chat_model("analyze_logs")
    response = await model.ainvoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=build_user_prompt(payload, docs)),
    ])
    markdown = response.content

    return {
        "summary": extract_section(markdown, "Summary"),
        "analysis": extract_section(markdown, "Analysis"),
        "solution": extract_section(markdown, "Probable Solution"),
        "markdown": markdown,
        "matched_known_issues": [d["title"] for d in docs],
    }
