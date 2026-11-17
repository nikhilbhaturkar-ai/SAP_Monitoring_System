import re

from app.models.schemas import EnvironmentContext

SYSTEM_PROMPT = (
    "You are an SAP BASIS incident analyst. Given a single failed background job's "
    "metadata, raw log and environment context, answer in Markdown with exactly "
    "these three bold headings:\n"
    "**Summary** — one plain-English sentence (max 25 words) saying what failed "
    "and why, readable by a non-specialist.\n"
    "**Diagnosis** — 2-4 sentences naming the specific error and likely root cause.\n"
    "**Corrective Procedure** — the exact fix as numbered steps, including the SAP "
    "transaction codes, HANA SQL statements or OS commands to run."
)

# Matches DB13 / DBACOCKPIT backup jobs and anything named as a backup.
_BACKUP_RE = re.compile(r"backup|bkp|\bdb13\b", re.IGNORECASE)

_SUMMARY_RE = re.compile(r"\*\*Summary\*\*[:\s\-—]*(.+?)(?=\n\s*\*\*|\Z)", re.IGNORECASE | re.DOTALL)


def is_backup_job(job) -> bool:
    return bool(_BACKUP_RE.search(f"{job.job_name} {job.program} {job.tcode}"))


def other_failures_text(job, all_jobs) -> str:
    others = [j.job_name for j in all_jobs if j.job_id != job.job_id]
    if not others:
        return "Only this backup job is failing"
    shown = ", ".join(sorted(set(others))[:5])
    return f"{len(others)} other job(s) also failed in this run ({shown})"


def build_context(job, environment: dict | None, all_jobs=()) -> str:
    env = EnvironmentContext(**(environment or {}))
    parts = [f"Database: {env.database}."]
    if env.system:
        parts.append(f"System: {env.system}.")
    if env.environment:
        parts.append(f"Environment: {env.environment}.")
    # Other-failure context only helps (and is only accurate) for backup jobs.
    if is_backup_job(job):
        parts.append(f"Other job failures: {other_failures_text(job, all_jobs or [job])}.")
    parts.append(f"Recent system refresh/copy/migration: {env.recent_refresh}.")
    parts.append("Give me the exact corrective procedure.")
    return " ".join(parts)


def build_user_prompt(job, environment: dict | None = None, all_jobs=()) -> str:
    return (
        f"Job name: {job.job_name}\n"
        f"Program: {job.program}\n"
        f"T-code: {job.tcode}\n"
        f"Error code: {job.error_code}\n"
        f"Raw log:\n{job.raw_log}\n\n"
        f"{build_context(job, environment, all_jobs)}"
    )


def extract_summary(analysis: str) -> str | None:
    match = _SUMMARY_RE.search(analysis or "")
    if not match:
        return None
    return " ".join(match.group(1).split()) or None
