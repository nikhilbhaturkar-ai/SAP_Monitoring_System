import json
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from app.llm.groq_client import get_chat_model

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

    # Prune and compact context to stay well under token limits
    compact_ctx = prune_context(context)
    compact_json = json.dumps(compact_ctx, separators=(',', ':'))

    # Hard-limit context string length if still too large (max ~10k chars / ~2.5k tokens)
    if len(compact_json) > 10000:
        compact_json = compact_json[:10000] + "... [truncated]"

    # Build the system prompt using the context
    system_prompt = f"""You are a helpful SAP Monitoring Dashboard AI Assistant.
You have access to the following current dashboard state/context to answer user queries:

{compact_json}

Use this information to answer user questions, such as identifying failing checks, expiring certificates, or overall system health. Be concise, actionable, and helpful. Format your responses in Markdown.
"""

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
