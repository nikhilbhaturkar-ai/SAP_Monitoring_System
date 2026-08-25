SYSTEM_PROMPT = (
    "You are an SAP BASIS incident analyst. Given analyses of multiple failed "
    "background jobs from the same day, identify recurring error patterns across "
    "jobs. Respond ONLY with a JSON array of objects, each with keys: "
    '"pattern" (short label), "count" (number of jobs matching), "job_ids" '
    "(list of matching job ids). If no pattern repeats across 2+ jobs, return "
    "an empty array []."
)


def build_user_prompt(jobs) -> str:
    lines = []
    for job in jobs:
        lines.append(
            f"- job_id={job.job_id}, error_code={job.error_code}, "
            f"analysis={job.log_analysis}"
        )
    return "Failed jobs today:\n" + "\n".join(lines)
