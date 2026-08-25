import type { JobRecord } from "./types";

interface Props {
  jobs: JobRecord[];
  selectedJobId: string | null;
  onSelect: (jobId: string) => void;
}

export function JobList({ jobs, selectedJobId, onSelect }: Props) {
  if (jobs.length === 0) {
    return <p className="muted">No failed jobs retrieved yet.</p>;
  }

  return (
    <table className="job-table">
      <thead>
        <tr>
          <th>Job</th>
          <th>Program</th>
          <th>T-Code</th>
          <th>Error</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <tr
            key={job.job_id}
            className={job.job_id === selectedJobId ? "selected" : ""}
            onClick={() => onSelect(job.job_id)}
          >
            <td>{job.job_name}</td>
            <td>{job.program}</td>
            <td>{job.tcode}</td>
            <td>{job.error_code}</td>
            <td>{job.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
