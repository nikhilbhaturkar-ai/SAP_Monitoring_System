from fastapi import APIRouter
from pydantic import BaseModel

from app.models.schemas import ChatRequest
from app.llm.chat_agent import get_chat_response

router = APIRouter(prefix="/chat", tags=["chat"])

@router.post("")
async def chat_endpoint(payload: ChatRequest):
    # Convert ChatMessage objects to dicts for our function
    messages_dicts = [{"role": msg.role, "content": msg.content} for msg in payload.messages]
    
    # Process through the chat agent
    reply_content = get_chat_response(messages_dicts, payload.context)
    
    return {"reply": reply_content}
