SYSTEM_PROMPT = (
    "You are an SAP BASIS incident analyst. Given a single failed background job's "
    "metadata and raw log, produce a concise (3-5 sentence) technical analysis of "
    "why it failed. Name the specific error code and likely root cause. Do not "
    "recommend fixes here, just diagnose."
)


def build_user_prompt(job) -> str:
    return (
        f"Job name: {job.job_name}\n"
        f"Program: {job.program}\n"
        f"T-code: {job.tcode}\n"
        f"Error code: {job.error_code}\n"
        f"Raw log:\n{job.raw_log}\n\n"
        "Analyze why this job failed."
    )
