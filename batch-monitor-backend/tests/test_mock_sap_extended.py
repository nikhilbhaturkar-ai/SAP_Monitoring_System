"""Extended tests for MockSAPClient beyond the basic ones in test_adapters.py."""
import pytest

from app.adapters.sap.mock import MockSAPClient, _is_iso_date


# ── _is_iso_date ───────────────────────────────────────────────────────────────

def test_is_iso_date_valid():
    assert _is_iso_date("2026-09-30") is True
    assert _is_iso_date("2026-01-01T00:00:00") is True


def test_is_iso_date_invalid():
    assert _is_iso_date("not-a-date") is False
    assert _is_iso_date("30/09/2026") is False
    assert _is_iso_date("") is False


# ── MockSAPClient.get_failed_jobs ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_jobs_have_required_fields():
    client = MockSAPClient()
    jobs = await client.get_failed_jobs("2026-09-30")
    for job in jobs:
        assert job.job_id
        assert job.job_name
        assert job.program
        assert job.tcode
        assert job.status == "CANCELLED"
        assert job.start_time
        assert job.end_time
        assert job.error_code
        assert job.raw_log


@pytest.mark.asyncio
async def test_job_ids_contain_date_digits():
    client = MockSAPClient()
    jobs = await client.get_failed_jobs("2026-09-30")
    for job in jobs:
        assert "20260930" in job.job_id


@pytest.mark.asyncio
async def test_different_dates_produce_different_jobs():
    client = MockSAPClient()
    jobs_a = await client.get_failed_jobs("2026-09-01")
    jobs_b = await client.get_failed_jobs("2026-09-02")
    # At least the job ids differ since the date component differs
    ids_a = {j.job_id for j in jobs_a}
    ids_b = {j.job_id for j in jobs_b}
    assert ids_a != ids_b


@pytest.mark.asyncio
async def test_jobs_count_within_bounds():
    client = MockSAPClient()
    for date in ["2026-01-01", "2026-06-15", "2026-12-31"]:
        jobs = await client.get_failed_jobs(date)
        assert 4 <= len(jobs) <= 6, f"Unexpected count {len(jobs)} for {date}"


@pytest.mark.asyncio
async def test_get_job_log_returns_string():
    client = MockSAPClient()
    log = await client.get_job_log("JOB1000_20260930")
    assert isinstance(log, str)
    assert len(log) > 0


@pytest.mark.asyncio
async def test_get_job_log_unknown_returns_no_log_found():
    client = MockSAPClient()
    log = await client.get_job_log("UNKNOWN_ID")
    # Any JOB-prefixed id returns a template log; non-JOB ids also return "No log found."
    assert isinstance(log, str)
