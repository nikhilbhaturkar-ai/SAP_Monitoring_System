import { useState } from "react";

import { createTicket, notifyTeam } from "../api/client";
import type { JobRecord } from "../types";

interface Props {
  investigationId: string;
  job: JobRecord;
  onUpdated: (job: JobRecord) => void;
}

export function ActionButtons({ investigationId, job, onUpdated }: Props) {
  const [busy, setBusy] = useState<"ticket" | "notify" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCreateTicket = async () => {
    setBusy("ticket");
    setErrorMsg(null);
    try {
      const result = await createTicket(investigationId, job.job_id);
      onUpdated({ ...job, ticket_result: result });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleNotify = async () => {
    setBusy("notify");
    setErrorMsg(null);
    try {
      const result = await notifyTeam(investigationId, job.job_id, "BASIS");
      onUpdated({ ...job, notify_result: result });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="action-buttons">
      <button disabled={busy !== null} onClick={handleCreateTicket}>
        {job.ticket_result ? `Ticket: ${job.ticket_result.ticket_number}` : "Create ServiceNow Ticket"}
      </button>
      <button disabled={busy !== null} onClick={handleNotify}>
        {job.notify_result ? `Notified: ${job.notify_result.channel}` : "Notify Team"}
      </button>
      {errorMsg && <span className="error">{errorMsg}</span>}
    </div>
  );
}
