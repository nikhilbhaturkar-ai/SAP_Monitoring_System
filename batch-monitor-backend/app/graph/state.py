import operator
from typing import Annotated, Any, NotRequired, TypedDict


class InvestigationState(TypedDict):
    investigation_id: str
    run_date: str
    failed_jobs: list[dict[str, Any]]
    recurring_errors: NotRequired[list[dict[str, Any]]]
    _retrieved_docs: NotRequired[list[dict[str, Any]]]
    incident_summary: NotRequired[str]
    recommended_actions: NotRequired[list[str]]
    status: str
    progress_log: Annotated[list[str], operator.add]
    error: NotRequired[str]
