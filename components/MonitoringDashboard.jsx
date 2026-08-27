'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { AlertsBell } from './AlertsBell.jsx';
import { MetricsOverview } from './MetricsOverview.jsx';
import { TrendPanel } from './TrendPanel.jsx';
import { HistoryTable } from './HistoryTable.jsx';
import { statusOf } from '../lib/status.js';

const LOGO_URL = '/mpower-logo.png';

export default function MonitoringDashboard() {
  const [sid, setSid] = useState('MSD');
  const [view, setView] = useState('snapshot');

  const [dashboard, setDashboard] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Refetch keeps the frame: hold the previous render at reduced opacity.
  const hasRendered = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [next, historyRows] = await Promise.all([api.dashboard(sid), api.history(sid)]);
      setDashboard(next);
      setHistory(historyRows);
      hasRendered.current = true;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sid]);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !dashboard) {
    return (
      <main className="shell">
        <div className="card state-panel">
          <p>
            <strong>Could not reach the monitoring API.</strong>
          </p>
          <p>{error}</p>
          <p>
            Start the stack with <code>npm run setup</code> then <code>npm run dev</code>.
          </p>
        </div>
      </main>
    );
  }

  if (!dashboard) {
    return (
      <main className="shell">
        <div className="card state-panel">Loading landscape health…</div>
      </main>
    );
  }

  const card = dashboard.systemCard;
  const headStatus = card.status === 'healthy' ? 'good' : card.status;
  const meta = statusOf(headStatus);

  return (
    <main className="shell">
      <header className="masthead">
        <div className="brand">
          <img className="brand-logo" src={LOGO_URL} alt="M Power" />
          <div>
            <div className="eyebrow">
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: meta.color,
                  display: 'inline-block',
                }}
                aria-hidden="true"
              />
              SAP Basis monitoring
            </div>
            <h1>Landscape Health Dashboard</h1>
            <p className="subtitle">
              {card.sid} · {card.name} — daily operations checklist · latest run{' '}
              {dashboard.latestRun.label}
            </p>
          </div>
        </div>

        <div className="masthead-actions">
          <span className="refresh-note">
            Last refresh: {new Date(dashboard.generatedAt).toLocaleString('en-GB')}
          </span>
        </div>
      </header>

      {/* Scope bar: what the page is showing, and the controls that change it. */}
      <div className="scopebar">
        <label className="scope-chip">
          <span className="scope-chip-label">Scope</span>
          <select value={sid} onChange={(e) => setSid(e.target.value)}>
            {dashboard.systems.map((system) => (
              <option key={system.sid} value={system.sid}>
                {system.sid} — {system.name}
              </option>
            ))}
          </select>
        </label>

        <span className="scope-chip scope-chip-static">
          <span className="scope-chip-label">Latest run</span>
          {dashboard.latestRun.label}
        </span>

        <span className="filters-spacer" />
        <AlertsBell alerts={dashboard.alerts} sid={card.sid} />
      </div>

      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>Home</span>
        <span aria-hidden="true">/</span>
        <span>Monitoring</span>
        <span aria-hidden="true">/</span>
        <span className="breadcrumb-current">
          {card.sid} ({card.name})
        </span>
      </nav>

      {/* System identity row, with the health score alongside it. */}
      <div className="system-bar">
        <div
          className="score-ring"
          style={{
            background: `conic-gradient(${meta.color} ${card.score}%, var(--gridline) 0)`,
          }}
          role="img"
          aria-label={`Health score ${card.score} out of 100`}
        >
          <div className="score-ring-inner">{card.score}</div>
        </div>
        <div>
          <div className="system-sid">{card.sid}</div>
          <div className="system-name">{card.name}</div>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Dashboard view">
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={view === 'snapshot'}
          onClick={() => setView('snapshot')}
        >
          Metrics overview
        </button>
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={view === 'history'}
          onClick={() => setView('history')}
        >
          History log
        </button>
      </div>

      <div className={loading && hasRendered.current ? 'is-stale' : undefined}>
        {view === 'snapshot' ? (
          <>
            <MetricsOverview
              card={card}
              endpoints={dashboard.endpoints}
              runLabel={dashboard.latestRun.label}
            />
            <TrendPanel
              trends={dashboard.trends}
              sid={card.sid}
              windowDays={dashboard.windowDays}
            />
          </>
        ) : (
          <HistoryTable rows={history} sid={card.sid} />
        )}
      </div>

      {error && (
        <p className="filter-note" role="alert" style={{ marginTop: 16 }}>
          Refresh failed: {error}
        </p>
      )}
    </main>
  );
}
