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


class CreateInvestigationRequest(BaseModel):
    run_date: str


class NotifyRequest(BaseModel):
    team: str = "BASIS"
