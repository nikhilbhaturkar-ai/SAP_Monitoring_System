import type { RecurringError } from "./types";

interface Props {
  summary?: string;
  recommendedActions?: string[];
  recurringErrors?: RecurringError[];
}

export function IncidentSummaryPanel({ summary, recommendedActions, recurringErrors }: Props) {
  if (!summary) {
    return (
      <div className="panel">
        <h3>Incident Summary</h3>
        <p className="muted">Summary will appear once the investigation completes.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3>Incident Summary</h3>
      <p>{summary}</p>

      {recurringErrors && recurringErrors.length > 0 && (
        <>
          <h4>Recurring Error Patterns</h4>
          <ul>
            {recurringErrors.map((r) => (
              <li key={r.pattern}>
                {r.pattern} — {r.count} job(s)
              </li>
            ))}
          </ul>
        </>
      )}

      {recommendedActions && recommendedActions.length > 0 && (
        <>
          <h4>Recommended Corrective Actions</h4>
          <ul>
            {recommendedActions.map((action, idx) => (
              <li key={idx}>{action}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
