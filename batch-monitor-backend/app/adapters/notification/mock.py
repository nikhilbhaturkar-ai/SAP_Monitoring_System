import random
from datetime import datetime

from app.adapters.notification.base import NotificationClient
from app.models.schemas import JobRecord, NotifyResult


class MockNotificationClient(NotificationClient):
    async def notify_team(
        self, job: JobRecord, summary: str, team: str
    ) -> NotifyResult:
        return NotifyResult(
            message_id=f"msg_{random.randint(100000, 999999)}",
            channel=f"#{team.lower()}-alerts",
            team=team,
            sent_at=datetime.utcnow().isoformat(),
        )
