from abc import ABC, abstractmethod

from app.models.schemas import JobRecord


class SAPClient(ABC):
    @abstractmethod
    async def get_failed_jobs(self, date: str) -> list[JobRecord]: ...

    @abstractmethod
    async def get_job_log(self, job_id: str) -> str: ...
