"use client";

import { useEffect, useRef, useState } from "react";

import { createInvestigation, fetchSapBatchJobs, streamInvestigation } from "./api/client";
import type { InvestigationState, JobRecord } from "./types";
import { IncidentSummaryPanel } from "./IncidentSummaryPanel";
import { JobDrilldown } from "./JobDrilldown";
import { JobList } from "./JobList";
import { ProgressTracker } from "./ProgressTracker";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Dashboard() {
  const [runDate, setRunDate]               = useState(todayIso());
  const [jobs, setJobs]                     = useState<JobRecord[]>([]);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId]   = useState<string | null>(null);
  const [fetched, setFetched]               = useState(false);

  // Investigation state
  const [investigationId, setInvestigationId]     = useState<string>("");
  const [investigationStatus, setInvestigationStatus] = useState<string>("");
  const [progressLog, setProgressLog]             = useState<string[]>([]);
  const [summary, setSummary]                     = useState<string | undefined>();
  const [recommendedActions, setRecommendedActions] = useState<string[]>([]);
  const [recurringErrors, setRecurringErrors]     = useState<InvestigationState["recurring_errors"]>([]);

  // Keep a live reference to jobs so the SSE handler can merge without stale closure
  const jobsRef = useRef<JobRecord[]>([]);
  useEffect(() => { jobsRef.current = jobs; }, [jobs]);

  const applyInvestigationUpdate = (state: InvestigationState) => {
    setInvestigationStatus(state.status ?? "");
    setProgressLog(state.progress_log ?? []);
    setSummary(state.incident_summary);
    setRecommendedActions(state.recommended_actions ?? []);
    setRecurringErrors(state.recurring_errors ?? []);

    // Merge analysis results back into the job list as they arrive
    if (state.failed_jobs && state.failed_jobs.length > 0) {
      setJobs((prev) => {
        const byId = new Map(prev.map((j) => [j.job_id, j]));
        for (const updated of state.failed_jobs) {
          if (byId.has(updated.job_id)) {
            byId.set(updated.job_id, { ...byId.get(updated.job_id)!, ...updated });
          }
        }
        return Array.from(byId.values());
      });
    }
  };

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    setSelectedJobId(null);
    setInvestigationId("");
    setInvestigationStatus("");
    setProgressLog([]);
    setSummary(undefined);
    setRecommendedActions([]);
    setRecurringErrors([]);

    try {
      const data = await fetchSapBatchJobs(runDate);
      setJobs(data);
      setFetched(true);

      // Kick off AI investigation immediately, passing the real jobs so the
      // backend skips its mock fetch and analyses the same records we display.
      const { investigation_id } = await createInvestigation(runDate, data);
      setInvestigationId(investigation_id);
      setInvestigationStatus("running");

      // Subscribe to SSE stream — updates arrive until status is terminal
      const unsub = streamInvestigation(investigation_id, (state) => {
        applyInvestigationUpdate(state);
        if (["awaiting_action", "completed", "error"].includes(state.status ?? "")) {
          unsub();
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleJobUpdated = (updatedJob: JobRecord) => {
    setJobs((prev) => prev.map((j) => (j.job_id === updatedJob.job_id ? updatedJob : j)));
  };

  const selectedJob = jobs.find((j) => j.job_id === selectedJobId) ?? null;

  return (
    <div className="dashboard">
      <header>
        <h1>SAP Batch Job Monitor</h1>
        <div className="run-controls">
          <label>
            Run date:
            <input
              type="date"
              value={runDate}
              onChange={(e) => setRunDate(e.target.value)}
            />
          </label>
          <button onClick={handleFetch} disabled={loading}>
            {loading ? "Fetching…" : "Fetch Jobs"}
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {fetched && (
        <div className="main-grid">
          <div className="panel">
            <h3>Batch Jobs ({jobs.length})</h3>
            <JobList
              jobs={jobs}
              selectedJobId={selectedJobId}
              onSelect={setSelectedJobId}
            />
          </div>

          {investigationStatus && (
            <ProgressTracker
              progressLog={progressLog}
              status={investigationStatus}
            />
          )}
        </div>
      )}

      {fetched && (summary || investigationStatus) && (
        <IncidentSummaryPanel
          summary={summary}
          recommendedActions={recommendedActions}
          recurringErrors={recurringErrors}
        />
      )}

      {selectedJob && (
        <JobDrilldown
          investigationId={investigationId}
          job={selectedJob}
          onUpdated={handleJobUpdated}
          onClose={() => setSelectedJobId(null)}
        />
      )}
    </div>
  );
}
