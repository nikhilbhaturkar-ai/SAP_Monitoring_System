from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_env_file = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_env_file, ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    GROQ_API_KEY: str = ""

    GROQ_MODEL_DEFAULT: str = "llama-3.3-70b-versatile"
    GROQ_MODEL_ANALYSIS: str = "llama-3.1-8b-instant"
    GROQ_MODEL_RECURRING: str = "llama-3.1-8b-instant"
    GROQ_MODEL_SUMMARY: str = "llama-3.3-70b-versatile"
    GROQ_MODEL_RECOMMEND: str = "llama-3.3-70b-versatile"

    SAP_CLIENT_IMPL: str = "mock"
    TICKETING_CLIENT_IMPL: str = "mock"
    NOTIFICATION_CLIENT_IMPL: str = "mock"

    EMBEDDINGS_IMPL: str = "local"
    VECTORSTORE_IMPL: str = "chroma"
    CHROMA_PERSIST_DIR: str = "./data/chroma"

    BACKEND_HOST: str = "127.0.0.1"
    BACKEND_PORT: int = 8000


settings = Settings()

