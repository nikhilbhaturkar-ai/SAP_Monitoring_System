export interface TicketResult {
  ticket_number: string;
  url: string;
  created_at: string;
}

export interface NotifyResult {
  message_id: string;
  channel: string;
  team: string;
  sent_at: string;
}

export interface RetrievedDoc {
  title: string;
  text: string;
  source: string;
}

export interface JobRecord {
  job_id: string;
  job_name: string;
  program: string;
  tcode: string;
  status: string;
  start_time: string;
  end_time: string;
  error_code: string;
  raw_log: string;
  log_analysis?: string | null;
  matched_known_issues?: string[];
  retrieved_docs?: RetrievedDoc[];
  ticket_result?: TicketResult;
  notify_result?: NotifyResult;
}

export interface RecurringError {
  pattern: string;
  count: number;
  job_ids: string[];
}

export type InvestigationStatus =
  | "pending"
  | "running"
  | "awaiting_action"
  | "completed"
  | "error";

export interface InvestigationState {
  investigation_id: string;
  run_date: string;
  failed_jobs: JobRecord[];
  recurring_errors?: RecurringError[];
  incident_summary?: string;
  recommended_actions?: string[];
  status: InvestigationStatus;
  progress_log: string[];
  error?: string;
}
