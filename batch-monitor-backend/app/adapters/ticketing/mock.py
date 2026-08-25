import random
from datetime import datetime

from app.adapters.ticketing.base import TicketingClient
from app.models.schemas import JobRecord, TicketResult


class MockTicketingClient(TicketingClient):
    async def create_ticket(
        self, job: JobRecord, summary: str, actions: list[str]
    ) -> TicketResult:
        number = f"INC{random.randint(1000000, 9999999)}"
        return TicketResult(
            ticket_number=number,
            url=f"https://mock-servicenow.example.com/incident.do?number={number}",
            created_at=datetime.utcnow().isoformat(),
        )
