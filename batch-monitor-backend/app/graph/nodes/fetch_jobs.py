from app.adapters.sap.factory import get_sap_client
from app.graph.state import InvestigationState


async def fetch_jobs(state: InvestigationState) -> dict:
    # Use pre-fetched jobs when the caller already has them (avoids mock data mismatch)
    if state.get("failed_jobs"):
        jobs = state["failed_jobs"]
        return {
            "progress_log": [f"Using {len(jobs)} pre-fetched jobs for {state['run_date']}"],
        }
    client = get_sap_client()
    jobs = await client.get_failed_jobs(state["run_date"])
    return {
        "failed_jobs": [job.model_dump() for job in jobs],
        "progress_log": [f"Retrieved {len(jobs)} failed jobs for {state['run_date']}"],
    }
