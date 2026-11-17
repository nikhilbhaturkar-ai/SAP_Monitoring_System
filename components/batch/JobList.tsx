import type { JobRecord } from "./types";

interface Props {
  jobs: JobRecord[];
  selectedJobId: string | null;
  onSelect: (jobId: string) => void;
}

// Log lines that say why a job stopped, most specific first.
const CAUSE_RE = /deleted|not found|does not exist|no authori|missing|failed|error|exception|cancel/i;

/** The most telling line of the error text / job log, skipping the generic "Job canceled" line. */
function errorSummary(job: JobRecord): string {
  const lines = [job.error_code, ...job.raw_log.split("\n")]
    .flatMap((t) => t.split(";"))
    .map((t) => t.trim())
    .filter(Boolean);
  const cause = lines.find((l) => CAUSE_RE.test(l) && !/^job canceled/i.test(l))
    ?? lines.find((l) => CAUSE_RE.test(l));
  return cause ?? "No error message in the job log.";
}

export function JobList({ jobs, selectedJobId, onSelect }: Props) {
  if (jobs.length === 0) {
    return <p className="muted">No failed jobs retrieved yet.</p>;
  }

  return (
    <table className="job-table">
      <thead>
        <tr>
          <th className="job-summary-col">Error Summary</th>
          <th>Job</th>
          <th>Program</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <tr
            key={job.job_id}
            className={job.job_id === selectedJobId ? "selected" : ""}
            onClick={() => onSelect(job.job_id)}
          >
            <td className="job-summary-col">{errorSummary(job)}</td>
            <td className="job-name-col">{job.job_name}</td>
            <td>{job.program}</td>
            <td className="job-error-col">{job.error_code || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
