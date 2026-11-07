import type { InvestigationState, JobRecord, NotifyResult, TicketResult } from "../types";

// Same origin as the rest of the app: the Express API proxies /api/batch/* to
// the Python backend, so no separate host/port is needed here.
const API_BASE = "/api/batch";

// ---------------------------------------------------------------------------
// SAP batch jobs — direct fetch from the SAP ABAP REST endpoint (proxied
// through Next.js to avoid CORS).
// ---------------------------------------------------------------------------

// SAP job step status codes → human-readable label
const SAP_STEP_STATUS: Record<string, string> = {
  A: 'Active',
  F: 'Finished',
  P: 'Scheduled',
  R: 'Running',
  S: 'Released',
  X: 'Unknown',
  Z: 'Initial',
};

/** Normalise a single SAP job record (with nested JOBSTEPS / JOBLOG) to JobRecord. */
function mapSapJob(raw: Record<string, unknown>, index: number): JobRecord {
  const jobName = String(raw['JOBNAME'] ?? '');

  // First step carries the program name and execution status
  const steps = Array.isArray(raw['JOBSTEPS']) ? raw['JOBSTEPS'] as Record<string, unknown>[] : [];
  const firstStep = steps[0] ?? {};
  const program = String(firstStep['PROGRAM'] ?? '');
  const rawStatus = String(firstStep['STATUS'] ?? '');
  const status = SAP_STEP_STATUS[rawStatus] ?? rawStatus;

  // Always include index to guarantee uniqueness — PRCHK alone is not unique
  // across jobs with the same name (SAP can repeat it).
  const prchk = firstStep['PRCHK'];
  const jobId = prchk != null ? `${jobName}_${prchk}_${index}` : `${jobName}_${index}`;

  // Parse job log entries
  const logEntries = Array.isArray(raw['JOBLOG']) ? raw['JOBLOG'] as Record<string, unknown>[] : [];

  // Extract start/end times from log messages (MSGNO 516 = started, 517 = finished)
  const startEntry = logEntries.find((e) => e['MSGNO'] === 516);
  const endEntry   = logEntries.find((e) => e['MSGNO'] === 517);
  const startTime  = startEntry ? `${startEntry['ENTERDATE'] ?? ''} ${startEntry['ENTERTIME'] ?? ''}`.trim() : '';
  const endTime    = endEntry   ? `${endEntry['ENTERDATE']   ?? ''} ${endEntry['ENTERTIME']   ?? ''}`.trim() : '';

  // Collect error messages (MSGTYPE 'E' = Error, 'A' = Abend)
  const errorEntries = logEntries.filter((e) => e['MSGTYPE'] === 'E' || e['MSGTYPE'] === 'A');
  const errorCode = errorEntries.map((e) => String(e['TEXT'] ?? '')).filter(Boolean).join('; ');

  // Full log as readable text
  const rawLog = logEntries.map((e) => String(e['TEXT'] ?? '')).filter(Boolean).join('\n');

  return {
    job_id:     jobId,
    job_name:   jobName,
    program,
    tcode:      '',
    status,
    start_time: startTime,
    end_time:   endTime,
    error_code: errorCode,
    raw_log:    rawLog,
  };
}

export async function fetchSapBatchJobs(date?: string): Promise<JobRecord[]> {
  const url = date ? `/api/sap-batch-jobs?date=${encodeURIComponent(date)}` : '/api/sap-batch-jobs';
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`SAP batch jobs request failed: ${resp.status}`);
  const data = await resp.json();

  // SAP returns the array directly at the top level
  const rows: unknown[] = Array.isArray(data)
    ? data
    : (data?.jobs ?? data?.JOBS ?? data?.batch_jobs ?? data?.results ?? []);

  return rows.map((r, i) => mapSapJob(r as Record<string, unknown>, i));
}

export async function createInvestigation(
  runDate: string,
  jobs?: JobRecord[],
): Promise<{ investigation_id: string }> {
  const resp = await fetch(`${API_BASE}/investigations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_date: runDate, failed_jobs: jobs ?? [] }),
  });
  if (!resp.ok) throw new Error(`Failed to start investigation: ${resp.status}`);
  return resp.json();
}

export async function getInvestigation(id: string): Promise<InvestigationState> {
  const resp = await fetch(`${API_BASE}/investigations/${id}`);
  if (!resp.ok) throw new Error(`Failed to fetch investigation: ${resp.status}`);
  return resp.json();
}

export function streamInvestigation(
  id: string,
  onUpdate: (state: InvestigationState) => void
): () => void {
  const source = new EventSource(`${API_BASE}/investigations/${id}/stream`);
  source.addEventListener("update", (event) => {
    const data = JSON.parse((event as MessageEvent).data);
    onUpdate(data);
  });
  return () => source.close();
}

export async function createTicket(investigationId: string, jobId: string): Promise<TicketResult> {
  const resp = await fetch(
    `${API_BASE}/investigations/${investigationId}/jobs/${jobId}/ticket`,
    { method: "POST" }
  );
  if (!resp.ok) throw new Error(`Failed to create ticket: ${resp.status}`);
  return resp.json();
}

export async function notifyTeam(
  investigationId: string,
  jobId: string,
  team: string
): Promise<NotifyResult> {
  const resp = await fetch(
    `${API_BASE}/investigations/${investigationId}/jobs/${jobId}/notify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team }),
    }
  );
  if (!resp.ok) throw new Error(`Failed to notify team: ${resp.status}`);
  return resp.json();
}
