from abc import ABC, abstractmethod

from app.models.schemas import JobRecord, NotifyResult


class NotificationClient(ABC):
    @abstractmethod
    async def notify_team(
        self, job: JobRecord, summary: str, team: str
    ) -> NotifyResult: ...
