import pytest

from app.adapters.notification.mock import MockNotificationClient
from app.adapters.sap.mock import MockSAPClient
from app.adapters.ticketing.mock import MockTicketingClient


@pytest.mark.asyncio
async def test_mock_sap_client_returns_varied_jobs():
    client = MockSAPClient()
    jobs = await client.get_failed_jobs("2026-08-16")
    assert 4 <= len(jobs) <= 6
    assert all(job.status == "CANCELLED" for job in jobs)
    assert all(job.raw_log for job in jobs)


@pytest.mark.asyncio
async def test_mock_sap_client_deterministic_for_same_date():
    client = MockSAPClient()
    jobs_a = await client.get_failed_jobs("2026-08-16")
    jobs_b = await client.get_failed_jobs("2026-08-16")
    assert [j.job_name for j in jobs_a] == [j.job_name for j in jobs_b]


@pytest.mark.asyncio
async def test_mock_ticketing_client_creates_ticket():
    client = MockTicketingClient()
    jobs = await MockSAPClient().get_failed_jobs("2026-08-16")
    result = await client.create_ticket(jobs[0], "summary", ["action1"])
    assert result.ticket_number.startswith("INC")
    assert result.url


@pytest.mark.asyncio
async def test_mock_notification_client_notifies_team():
    client = MockNotificationClient()
    jobs = await MockSAPClient().get_failed_jobs("2026-08-16")
    result = await client.notify_team(jobs[0], "summary", "BASIS")
    assert result.team == "BASIS"
    assert result.channel == "#basis-alerts"
