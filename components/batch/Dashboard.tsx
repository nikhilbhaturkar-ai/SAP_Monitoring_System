"use client";

import { useCallback, useState } from "react";

import { createInvestigation, fetchSapBatchJobs } from "./api/client";
import type { EnvironmentContext, JobRecord } from "./types";
import { JobDrilldown } from "./JobDrilldown";
import { JobList } from "./JobList";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface SelectedSystem {
  sid: string;
  name?: string;
  parent_sid?: string | null;
}

// SAP SID convention: the third letter names the tier (MSD → D → Development).
const TIER_BY_LETTER: Record<string, string> = {
  D: "Development",
  Q: "Quality",
  P: "Production",
  S: "Sandbox",
};

/** Analysis context for the system selected in the dashboard sidebar. */
function environmentFor(system?: SelectedSystem): EnvironmentContext {
  if (!system) return { system: "", environment: "" };
  const baseSid = system.parent_sid ?? system.sid;
  return {
    system: system.name ? `${system.name} (SID ${system.sid})` : system.sid,
    environment: TIER_BY_LETTER[baseSid.charAt(2).toUpperCase()] ?? "",
  };
}

export function Dashboard({ system }: { system?: SelectedSystem } = {}) {
  const [runDate, setRunDate]               = useState(todayIso());
  const [jobs, setJobs]                     = useState<JobRecord[]>([]);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId]   = useState<string | null>(null);
  const [fetched, setFetched]               = useState(false);
  // Holds the fetched jobs server-side so ticket / notify actions can find them.
  const [investigationId, setInvestigationId] = useState<string>("");

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    setSelectedJobId(null);
    setInvestigationId("");

    try {
      const data = await fetchSapBatchJobs(runDate);
      setJobs(data);
      setFetched(true);

      // Register the jobs without running the AI analysis — analysis is now
      // on demand, per job, via the popup's "Analyze Error" button.
      const { investigation_id } = await createInvestigation(runDate, data, environmentFor(system), false);
      setInvestigationId(investigation_id);
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
  // Stable so the popup's Esc/focus effect doesn't re-run on every render.
  const closeDrilldown = useCallback(() => setSelectedJobId(null), []);

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
        <div className="panel">
          <h3>Batch Jobs ({jobs.length})</h3>
          <JobList
            jobs={jobs}
            selectedJobId={selectedJobId}
            onSelect={setSelectedJobId}
          />
        </div>
      )}

      {selectedJob && (
        <JobDrilldown
          key={selectedJob.job_id}
          investigationId={investigationId}
          job={selectedJob}
          environment={environmentFor(system)}
          onUpdated={handleJobUpdated}
          onClose={closeDrilldown}
        />
      )}
    </div>
  );
}
