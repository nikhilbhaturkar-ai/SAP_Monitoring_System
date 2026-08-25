from fastapi import APIRouter, HTTPException

from app.adapters.notification.factory import get_notification_client
from app.adapters.ticketing.factory import get_ticketing_client
from app.models.schemas import JobRecord, NotifyRequest
from app.storage.investigation_store import store

router = APIRouter(prefix="/investigations", tags=["actions"])


async def _get_job(investigation_id: str, job_id: str) -> tuple[dict, JobRecord]:
    state = await store.get(investigation_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Investigation not found")
    for job_dict in state.get("failed_jobs", []):
        if job_dict.get("job_id") == job_id:
            return state, JobRecord(**job_dict)
    raise HTTPException(status_code=404, detail="Job not found")


@router.post("/{investigation_id}/jobs/{job_id}/ticket")
async def create_ticket(investigation_id: str, job_id: str):
    state, job = await _get_job(investigation_id, job_id)
    client = get_ticketing_client()
    summary = state.get("incident_summary", "")
    actions = state.get("recommended_actions", [])
    result = await client.create_ticket(job, summary, actions)

    jobs = state.get("failed_jobs", [])
    for j in jobs:
        if j.get("job_id") == job_id:
            j["ticket_result"] = result.model_dump()
    await store.update(investigation_id, {"failed_jobs": jobs})

    return result


@router.post("/{investigation_id}/jobs/{job_id}/notify")
async def notify_team(investigation_id: str, job_id: str, payload: NotifyRequest):
    state, job = await _get_job(investigation_id, job_id)
    client = get_notification_client()
    summary = state.get("incident_summary", "")
    result = await client.notify_team(job, summary, payload.team)

    jobs = state.get("failed_jobs", [])
    for j in jobs:
        if j.get("job_id") == job_id:
            j["notify_result"] = result.model_dump()
    await store.update(investigation_id, {"failed_jobs": jobs})

    return result
