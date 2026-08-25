from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_actions import router as actions_router
from app.api.routes_investigation import router as investigation_router
from app.rag.ingest import ensure_ingested


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_ingested()
    yield


app = FastAPI(title="SAP Batch Job Monitor", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(investigation_router)
app.include_router(actions_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
