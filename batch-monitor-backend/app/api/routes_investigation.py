import asyncio
import json
import uuid

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.graph.graph import get_graph
from app.models.schemas import CreateInvestigationRequest
from app.storage.investigation_store import store

router = APIRouter(prefix="/investigations", tags=["investigations"])


async def _run_investigation(investigation_id: str, run_date: str) -> None:
    graph = get_graph()
    initial_state = {
        "investigation_id": investigation_id,
        "run_date": run_date,
        "failed_jobs": [],
        "status": "running",
        "progress_log": [],
    }
    try:
        async for update in graph.astream(initial_state, stream_mode="updates"):
            for _node_name, partial in update.items():
                await store.update(investigation_id, partial)
        current = await store.get(investigation_id)
        if current and current.get("status") == "running":
            await store.update(investigation_id, {"status": "awaiting_action"})
    except Exception as exc:  # noqa: BLE001
        await store.update(investigation_id, {"status": "error", "error": str(exc)})


@router.post("")
async def create_investigation(payload: CreateInvestigationRequest):
    investigation_id = str(uuid.uuid4())
    await store.create(
        investigation_id,
        {
            "investigation_id": investigation_id,
            "run_date": payload.run_date,
            "failed_jobs": [],
            "status": "pending",
            "progress_log": [],
        },
    )
    asyncio.create_task(_run_investigation(investigation_id, payload.run_date))
    return {"investigation_id": investigation_id, "status": "pending"}


@router.get("/{investigation_id}")
async def get_investigation(investigation_id: str):
    state = await store.get(investigation_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return state


@router.get("/{investigation_id}/jobs/{job_id}")
async def get_job(investigation_id: str, job_id: str):
    state = await store.get(investigation_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Investigation not found")
    for job in state.get("failed_jobs", []):
        if job.get("job_id") == job_id:
            return job
    raise HTTPException(status_code=404, detail="Job not found")


@router.get("/{investigation_id}/stream")
async def stream_investigation(investigation_id: str):
    state = await store.get(investigation_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Investigation not found")

    async def event_generator():
        queue = store.subscribe(investigation_id)
        try:
            current = await store.get(investigation_id)
            if current:
                yield {"event": "update", "data": json.dumps(current)}
            while True:
                snapshot = await queue.get()
                yield {"event": "update", "data": json.dumps(snapshot)}
                if snapshot.get("status") in ("awaiting_action", "completed", "error"):
                    break
        finally:
            store.unsubscribe(investigation_id, queue)

    return EventSourceResponse(event_generator())
