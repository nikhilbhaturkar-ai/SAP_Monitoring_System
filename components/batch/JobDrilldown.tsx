"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import { ActionButtons } from "./ActionButtons";
import { analyzeError, type ErrorAnalysis } from "./api/client";
import type { EnvironmentContext, JobRecord } from "./types";

interface Props {
  investigationId: string;
  job: JobRecord;
  environment?: EnvironmentContext;
  onUpdated: (job: JobRecord) => void;
  onClose: () => void;
}

export function JobDrilldown({
  investigationId,
  job,
  environment,
  onUpdated,
  onClose,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [errorAnalysis, setErrorAnalysis] = useState<ErrorAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeFailed, setAnalyzeFailed] = useState<string | null>(null);

  const handleAnalyzeError = async () => {
    setAnalyzing(true);
    setAnalyzeFailed(null);
    try {
      setErrorAnalysis(await analyzeError(job, environment));
    } catch (err) {
      setAnalyzeFailed(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  // Esc closes; focus starts on Close and the page behind stops scrolling.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="drilldown-overlay" onClick={onClose}>
      <div
        className="drilldown"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drilldown-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drilldown-header">
          <h3 id="drilldown-title">{job.job_name}</h3>
          <button ref={closeRef} onClick={onClose}>Close</button>
        </div>

        <dl className="job-meta">
          <dt>Program</dt>
          <dd>{job.program}</dd>
          <dt>T-Code</dt>
          <dd>{job.tcode || "—"}</dd>
          <dt>Error</dt>
          <dd>{job.error_code || "—"}</dd>
          <dt>Start / End</dt>
          <dd>{job.start_time} → {job.end_time}</dd>
        </dl>

        <div className="analyze-error">
          <button
            type="button"
            className="analyze-error-btn"
            onClick={handleAnalyzeError}
            disabled={analyzing || !(job.error_code || job.raw_log)}
          >
            {analyzing ? "Analyzing…" : errorAnalysis ? "Re-run AI Analyzer" : "Run AI Analyzer"}
          </button>
          {analyzeFailed && <span className="error">{analyzeFailed}</span>}
        </div>

        {errorAnalysis && (
          <div className="error-analysis" aria-live="polite">
            {errorAnalysis.summary && <p className="error-analysis-summary">{errorAnalysis.summary}</p>}
            {errorAnalysis.analysis || errorAnalysis.solution ? (
              <>
                {errorAnalysis.analysis && (
                  <>
                    <h4>Error Analysis</h4>
                    <div className="drilldown-analysis">
                      <ReactMarkdown>{errorAnalysis.analysis}</ReactMarkdown>
                    </div>
                  </>
                )}
                {errorAnalysis.solution && (
                  <>
                    <h4>Probable Solution</h4>
                    <div className="drilldown-analysis">
                      <ReactMarkdown>{errorAnalysis.solution}</ReactMarkdown>
                    </div>
                  </>
                )}
              </>
            ) : (
              // Model ignored the headings — show its answer as-is.
              <div className="drilldown-analysis">
                <ReactMarkdown>{errorAnalysis.markdown}</ReactMarkdown>
              </div>
            )}
          </div>
        )}

        <h4>Raw Log</h4>
        <pre className="log-block">{job.raw_log}</pre>

        {job.matched_known_issues && job.matched_known_issues.length > 0 && (
          <>
            <h4>Matched Known Issues</h4>
            <ul>
              {job.matched_known_issues.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ul>
          </>
        )}

        {job.retrieved_docs && job.retrieved_docs.length > 0 && (
          <>
            <h4>Retrieved Documentation</h4>
            {job.retrieved_docs.map((doc, idx) => (
              <div key={idx} className="doc-excerpt">
                <strong>{doc.title}</strong>
                <p>{doc.text}</p>
              </div>
            ))}
          </>
        )}

        <ActionButtons investigationId={investigationId} job={job} onUpdated={onUpdated} />
      </div>
    </div>,
    document.body,
  );
}
