from typing import Optional

from pydantic import BaseModel


class JobRecord(BaseModel):
    job_id: str
    job_name: str
    program: str
    tcode: str
    status: str
    start_time: str
    end_time: str
    error_code: str
    raw_log: str
    log_analysis: Optional[str] = None
    error_summary: Optional[str] = None
    matched_known_issues: list[str] = []
    retrieved_docs: list[dict] = []


class RecurringError(BaseModel):
    pattern: str
    count: int
    job_ids: list[str]


class TicketResult(BaseModel):
    ticket_number: str
    url: str
    created_at: str


class NotifyResult(BaseModel):
    message_id: str
    channel: str
    team: str
    sent_at: str


class EnvironmentContext(BaseModel):
    # The system selected in the dashboard sidebar, e.g. "MSD — Client 100"
    system: str = ""
    database: str = "SAP HANA"
    # Derived from the SID by the front end; empty when it can't be inferred
    environment: str = ""
    recent_refresh: str = "No"


class AnalyzeErrorRequest(BaseModel):
    error: str
    job_name: str = ""
    program: str = ""
    tcode: str = ""
    raw_log: str = ""
    environment: EnvironmentContext = EnvironmentContext()


class CreateInvestigationRequest(BaseModel):
    run_date: str
    failed_jobs: list[JobRecord] = []
    environment: EnvironmentContext = EnvironmentContext()
    # False only stores the jobs (for ticket / notify) without calling the LLM.
    run_analysis: bool = True


class NotifyRequest(BaseModel):
    team: str = "BASIS"


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    context: dict
