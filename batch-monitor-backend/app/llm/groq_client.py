from langchain_groq import ChatGroq

from app.config import settings

_NODE_MODEL_ENV = {
    "analyze_logs": "GROQ_MODEL_ANALYSIS",
    "identify_recurring": "GROQ_MODEL_RECURRING",
    "summarize_incident": "GROQ_MODEL_SUMMARY",
    "recommend_actions": "GROQ_MODEL_RECOMMEND",
}


def get_chat_model(node_name: str) -> ChatGroq:
    env_key = _NODE_MODEL_ENV.get(node_name)
    model = getattr(settings, env_key, None) if env_key else None
    model = model or settings.GROQ_MODEL_DEFAULT
    return ChatGroq(model=model, api_key=settings.GROQ_API_KEY, temperature=0.2)
