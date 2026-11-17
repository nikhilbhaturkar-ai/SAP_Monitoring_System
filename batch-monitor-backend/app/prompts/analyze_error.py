import re

from app.models.schemas import EnvironmentContext

SYSTEM_PROMPT = (
    "You are an SAP BASIS incident analyst. You are given one SAP background job "
    "error, optionally with the job's metadata, raw log, environment and related "
    "known-issue documentation. Answer in Markdown with exactly these three bold "
    "headings:\n"
    "**Summary** — one plain-English sentence (max 25 words) saying what failed and why.\n"
    "**Analysis** — 3-5 sentences: what the error means, the most likely root cause, "
    "and how to confirm it (transaction codes, tables or logs to check).\n"
    "**Probable Solution** — the fix as numbered steps, including the exact SAP "
    "transaction codes, HANA SQL statements or OS commands to run, then one line "
    "on how to prevent it recurring.\n"
    "Only cite documentation that is actually relevant to this error."
)

_SECTION_RE = r"\*\*{name}\*\*[:\s\-—]*(.+?)(?=\n\s*\*\*[A-Z][^*]*\*\*|\Z)"


def build_user_prompt(payload, retrieved_docs) -> str:
    env = payload.environment or EnvironmentContext()
    lines = [f"Error:\n{payload.error}"]
    if payload.job_name:
        lines.append(f"Job name: {payload.job_name}")
    if payload.program:
        lines.append(f"Program: {payload.program}")
    if payload.tcode:
        lines.append(f"T-code: {payload.tcode}")
    if payload.raw_log:
        lines.append(f"Raw log:\n{payload.raw_log}")

    context = [f"Database: {env.database}."]
    if env.system:
        context.append(f"System: {env.system}.")
    if env.environment:
        context.append(f"Environment: {env.environment}.")
    context.append(f"Recent system refresh/copy/migration: {env.recent_refresh}.")
    lines.append(" ".join(context))

    if retrieved_docs:
        docs = "\n".join(f"- {d['title']}: {d['text'][:400]}" for d in retrieved_docs)
        lines.append(f"Possibly related known-issue documentation:\n{docs}")

    lines.append("Analyze this error and give the probable solution.")
    return "\n\n".join(lines)


def extract_section(markdown: str, name: str) -> str | None:
    match = re.search(_SECTION_RE.format(name=re.escape(name)), markdown or "", re.IGNORECASE | re.DOTALL)
    return match.group(1).strip() if match else None
