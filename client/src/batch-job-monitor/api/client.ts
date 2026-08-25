import type { InvestigationState, NotifyResult, TicketResult } from "../types";

// Same origin as the rest of the app: the Express API proxies /api/batch/* to
// the Python backend, so no separate host/port is needed here.
const API_BASE = "/api/batch";

export async function createInvestigation(runDate: string): Promise<{ investigation_id: string }> {
  const resp = await fetch(`${API_BASE}/investigations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_date: runDate }),
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
