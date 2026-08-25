import { ActionButtons } from "./ActionButtons";
import type { JobRecord } from "../types";

interface Props {
  investigationId: string;
  job: JobRecord;
  onUpdated: (job: JobRecord) => void;
  onClose: () => void;
}

export function JobDrilldown({ investigationId, job, onUpdated, onClose }: Props) {
  return (
    <div className="drilldown">
      <div className="drilldown-header">
        <h3>{job.job_name} ({job.job_id})</h3>
        <button onClick={onClose}>Close</button>
      </div>

      <dl className="job-meta">
        <dt>Program</dt>
        <dd>{job.program}</dd>
        <dt>T-Code</dt>
        <dd>{job.tcode}</dd>
        <dt>Error Code</dt>
        <dd>{job.error_code}</dd>
        <dt>Start / End</dt>
        <dd>{job.start_time} → {job.end_time}</dd>
      </dl>

      <h4>Raw Log</h4>
      <pre className="log-block">{job.raw_log}</pre>

      <h4>Analysis</h4>
      <p>{job.log_analysis ?? "Analysis in progress…"}</p>

      {job.matched_known_issues && job.matched_known_issues.length > 0 && (
        <>
          <h4>Matched Known Issues</h4>
          <ul>
            {job.matched_known_issues.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
        </>
      )}

      {job.retrieved_docs && job.retrieved_docs.length > 0 && (
        <>
          <h4>Retrieved Documentation</h4>
          {job.retrieved_docs.map((doc, idx) => (
            <div key={idx} className="doc-excerpt">
              <strong>{doc.title}</strong>
              <p>{doc.text}</p>
            </div>
          ))}
        </>
      )}

      <ActionButtons investigationId={investigationId} job={job} onUpdated={onUpdated} />
    </div>
  );
}
