"use client";

import { useState } from "react";

import { fetchSapBatchJobs } from "./api/client";
import type { JobRecord } from "./types";
import { JobList } from "./JobList";
import { JobDrilldown } from "./JobDrilldown";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Dashboard() {
  const [runDate, setRunDate]           = useState(todayIso());
  const [jobs, setJobs]                 = useState<JobRecord[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [fetched, setFetched]           = useState(false);

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    setSelectedJobId(null);
    try {
      const data = await fetchSapBatchJobs(runDate);
      setJobs(data);
      setFetched(true);
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
        </div>
      )}

      {selectedJob && (
        <JobDrilldown
          investigationId=""
          job={selectedJob}
          onUpdated={handleJobUpdated}
          onClose={() => setSelectedJobId(null)}
        />
      )}
    </div>
  );
}
