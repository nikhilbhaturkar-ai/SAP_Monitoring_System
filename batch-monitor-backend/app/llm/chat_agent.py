import json
import re
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from app.llm.groq_client import get_chat_model
from app.config import settings

_DASHBOARD_KEYWORDS = re.compile(
    r'\b(sap|sid|system|dashboard|status|alert|check|volume|certificate|strust|'
    r'health|monitor|batch|job|error|fail|warning|disk|memory|space|param|'
    r'landscape|endpoint|trend|anomal)\b',
    re.IGNORECASE,
)

def _is_dashboard_query(messages: list[dict]) -> bool:
    """Return True only if the latest user message is about the SAP dashboard."""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            return bool(_DASHBOARD_KEYWORDS.search(msg.get("content", "")))
    return False

def prune_context(context: dict) -> dict:
    if not isinstance(context, dict):
        return {}

    dashboard = context.get("dashboard") or {}
    system = context.get("system") or {}

    pruned = {}

    if dashboard and isinstance(dashboard, dict):
        cleaned_dash = {}
        for k, v in dashboard.items():
            if k == "systemCard" and isinstance(v, dict):
                # Include essential system info without redundant tile lists if already present elsewhere
                cleaned_dash[k] = {
                    "sid": v.get("sid"),
                    "status": v.get("status"),
                    "dataVol": v.get("dataVol"),
                    "logVol": v.get("logVol"),
                    "freeApp": v.get("freeApp"),
                    "freeDb": v.get("freeDb"),
                    "params": v.get("params"),
                    "strust": v.get("strust"),
                }
            elif isinstance(v, list):
                # Cap list lengths to max 10 items to prevent payload bloat
                cleaned_dash[k] = v[:10]
            else:
                cleaned_dash[k] = v
        pruned["dashboard"] = cleaned_dash
    elif system and isinstance(system, dict):
        pruned["system"] = {
            "sid": system.get("sid"),
            "status": system.get("status"),
            "dataVol": system.get("dataVol"),
            "logVol": system.get("logVol"),
            "freeApp": system.get("freeApp"),
            "freeDb": system.get("freeDb"),
            "params": system.get("params"),
            "strust": system.get("strust"),
        }

    return pruned


def get_chat_response(messages: list[dict], context: dict) -> str:
    """
    Process the chat messages and dashboard context using LangChain & Groq.
    """
    # Create the LLM instance
    llm = get_chat_model("chat")  # fallback to default

    dashboard_sharing_enabled = settings.SEND_DASHBOARD_DATA_TO_LLM.strip().lower() == "yes"

    # If the query is about the dashboard but sharing is disabled, refuse early
    if _is_dashboard_query(messages) and not dashboard_sharing_enabled:
        return (
            "Dashboard data sharing is disabled. "
            "To allow the assistant to answer questions about your SAP system, "
            "set `SEND_DASHBOARD_DATA_TO_LLM=yes` in your `.env` file and restart the server."
        )

    # Only attach dashboard data when sharing is enabled AND the query needs it
    if dashboard_sharing_enabled and _is_dashboard_query(messages):
        compact_ctx = prune_context(context)
        compact_json = json.dumps(compact_ctx, separators=(',', ':'))
        if len(compact_json) > 10000:
            compact_json = compact_json[:10000] + "... [truncated]"
        context_block = f"\nCurrent dashboard state:\n{compact_json}\n"
    else:
        context_block = ""

    system_prompt = f"""You are a helpful SAP Monitoring Dashboard AI Assistant.
Answer the user's question concisely and accurately. Format responses in Markdown.{context_block}
Do not answer questions other than SAP or SAP Dashboard."""

    # Convert the messages into LangChain message objects (limit history to last 10 messages)
    lc_messages = [SystemMessage(content=system_prompt)]
    
    recent_messages = messages[-10:] if len(messages) > 10 else messages

    for msg in recent_messages:
        if msg["role"] == "user":
            lc_messages.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            lc_messages.append(AIMessage(content=msg["content"]))

    # Call the LLM
    response = llm.invoke(lc_messages)
    return response.content
