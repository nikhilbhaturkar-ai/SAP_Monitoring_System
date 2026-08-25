from abc import ABC, abstractmethod

from app.models.schemas import JobRecord, TicketResult


class TicketingClient(ABC):
    @abstractmethod
    async def create_ticket(
        self, job: JobRecord, summary: str, actions: list[str]
    ) -> TicketResult: ...
