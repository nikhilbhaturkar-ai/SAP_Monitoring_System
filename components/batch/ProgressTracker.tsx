interface Props {
  progressLog: string[];
  status: string;
}

export function ProgressTracker({ progressLog, status }: Props) {
  return (
    <div className="panel">
      <h3>Investigation Progress ({status})</h3>
      <ol className="progress-list">
        {progressLog.map((line, idx) => (
          <li key={idx}>{line}</li>
        ))}
      </ol>
      {progressLog.length === 0 && <p className="muted">Waiting for progress…</p>}
    </div>
  );
}
