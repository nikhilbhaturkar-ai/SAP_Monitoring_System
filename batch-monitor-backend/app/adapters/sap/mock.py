import random
from datetime import datetime, timedelta

from app.adapters.sap.base import SAPClient
from app.models.schemas import JobRecord

_JOB_TEMPLATES = [
    {
        "job_name": "ZFI_DUNNING_RUN",
        "program": "RFDUNN00",
        "tcode": "SM37",
        "error_code": "AUTHORITY_CHECK_FAILED",
        "log": (
            "Job started by BATCH_FI at 22:00:03\n"
            "Step 001 started (program RFDUNN00, variant DUNNING_DAILY)\n"
            "ABAP/4 processor: AUTHORITY_CHECK_FAILED\n"
            "User BATCH_FI is missing authorization object F_KNA1_BUK for company code 1000\n"
            "Job cancelled after step 001"
        ),
    },
    {
        "job_name": "ZSD_BILLING_COLLECTIVE",
        "program": "RV60SBAT",
        "tcode": "SM36",
        "error_code": "TIME_OUT",
        "log": (
            "Job started by BATCH_SD at 23:15:11\n"
            "Step 001 started (program RV60SBAT, variant BILL_COLLECT_EU)\n"
            "Enqueue error: foreign lock on table VBAK held by user J_DOE\n"
            "ENQUEUE_TABLE_LOCK: object VBAK entry 0000345678 already locked\n"
            "Job step terminated: TIME_OUT waiting for lock release (600s)\n"
            "Job cancelled after step 001"
        ),
    },
    {
        "job_name": "ZMM_STOCK_RECON",
        "program": "RM07MMFI",
        "tcode": "SM37",
        "error_code": "TSV_TNEW_PAGE_ALLOC_FAILED",
        "log": (
            "Job started by BATCH_MM at 01:30:00\n"
            "Step 001 started (program RM07MMFI, variant STOCK_RECON_PLANT_1000)\n"
            "Runtime error TSV_TNEW_PAGE_ALLOC_FAILED occurred\n"
            "No more storage space available for extending an internal table\n"
            "Short dump: ST22 dump ID 20260816013045\n"
            "Job cancelled after step 001"
        ),
    },
    {
        "job_name": "RSBTCPRI",
        "program": "RSBTCPRI",
        "tcode": "SM37",
        "error_code": "DBIF_RSQL_SQL_ERROR",
        "log": (
            "Job started by BATCH_ADMIN at 02:00:00\n"
            "Step 001 started (program RSBTCPRI)\n"
            "Database error: DBIF_RSQL_SQL_ERROR\n"
            "ORA-00060: deadlock detected while waiting for resource on table VBFA\n"
            "Job cancelled after step 001"
        ),
    },
    {
        "job_name": "ZCO_COST_ALLOC_MONTHLY",
        "program": "RKAZINT0",
        "tcode": "SM37",
        "error_code": "VARIANT_NOT_FOUND",
        "log": (
            "Job started by BATCH_CO at 03:00:00\n"
            "Step 001 started (program RKAZINT0, variant COST_ALLOC_2026)\n"
            "Variant COST_ALLOC_2026 does not exist for program RKAZINT0\n"
            "Likely cause: variant not transported to production after last transport\n"
            "Job cancelled after step 001"
        ),
    },
    {
        "job_name": "ZHR_PAYROLL_PREP",
        "program": "RPCALCX0",
        "tcode": "SM36",
        "error_code": "NO_BATCH_WP_AVAILABLE",
        "log": (
            "Job scheduled by BATCH_HR at 04:00:00, released but not started\n"
            "Job remained in 'Released' status for 45 minutes\n"
            "System log: no background work processes available (all BTC work processes busy)\n"
            "Job eventually cancelled by BASIS at 04:45:00\n"
        ),
    },
]


class MockSAPClient(SAPClient):
    async def get_failed_jobs(self, date: str) -> list[JobRecord]:
        rng = random.Random(date)
        n = rng.randint(4, len(_JOB_TEMPLATES))
        chosen = rng.sample(_JOB_TEMPLATES, n)
        jobs: list[JobRecord] = []
        base_time = datetime.fromisoformat(date) if _is_iso_date(date) else datetime.utcnow()
        for i, tpl in enumerate(chosen):
            start = base_time + timedelta(hours=rng.randint(0, 5), minutes=rng.randint(0, 59))
            end = start + timedelta(minutes=rng.randint(2, 40))
            jobs.append(
                JobRecord(
                    job_id=f"JOB{1000 + i}_{date.replace('-', '')}",
                    job_name=tpl["job_name"],
                    program=tpl["program"],
                    tcode=tpl["tcode"],
                    status="CANCELLED",
                    start_time=start.isoformat(),
                    end_time=end.isoformat(),
                    error_code=tpl["error_code"],
                    raw_log=tpl["log"],
                )
            )
        return jobs

    async def get_job_log(self, job_id: str) -> str:
        for tpl in _JOB_TEMPLATES:
            if job_id.startswith("JOB"):
                return tpl["log"]
        return "No log found."


def _is_iso_date(value: str) -> bool:
    try:
        datetime.fromisoformat(value)
        return True
    except ValueError:
        return False
