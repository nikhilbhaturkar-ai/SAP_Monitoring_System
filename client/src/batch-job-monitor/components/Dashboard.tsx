import { useState } from "react";

import { useInvestigation } from "../hooks/useInvestigation";
import type { JobRecord } from "../types";
import { IncidentSummaryPanel } from "./IncidentSummaryPanel";
import { JobDrilldown } from "./JobDrilldown";
import { JobList } from "./JobList";
import { ProgressTracker } from "./ProgressTracker";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Dashboard() {
  const { state, error, start, setState } = useInvestigation();
  const [runDate, setRunDate] = useState(todayIso());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const handleRun = async () => {
    setStarting(true);
    setSelectedJobId(null);
    await start(runDate);
    setStarting(false);
  };

  const handleJobUpdated = (updatedJob: JobRecord) => {
    if (!state) return;
    setState({
      ...state,
      failed_jobs: state.failed_jobs.map((j) => (j.job_id === updatedJob.job_id ? updatedJob : j)),
    });
  };

  const selectedJob = state?.failed_jobs.find((j) => j.job_id === selectedJobId) ?? null;

  return (
    <div className="dashboard">
      <header>
        <h1>SAP Batch Job Monitor</h1>
        <div className="run-controls">
          <label>
            Run date:
            <input type="date" value={runDate} onChange={(e) => setRunDate(e.target.value)} />
          </label>
          <button onClick={handleRun} disabled={starting}>
            {starting ? "Starting…" : "Run Investigation"}
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {state && (
        <>
          <ProgressTracker progressLog={state.progress_log} status={state.status} />

          <div className="main-grid">
            <div className="panel">
              <h3>Failed Jobs ({state.failed_jobs.length})</h3>
              <JobList
                jobs={state.failed_jobs}
                selectedJobId={selectedJobId}
                onSelect={setSelectedJobId}
              />
            </div>

            <IncidentSummaryPanel
              summary={state.incident_summary}
              recommendedActions={state.recommended_actions}
              recurringErrors={state.recurring_errors}
            />
          </div>

          {selectedJob && (
            <JobDrilldown
              investigationId={state.investigation_id}
              job={selectedJob}
              onUpdated={handleJobUpdated}
              onClose={() => setSelectedJobId(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
