'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { AlertsBell } from './AlertsBell.jsx';
import { MetricsOverview } from './MetricsOverview.jsx';
import { TrendPanel } from './TrendPanel.jsx';
import { HistoryTable } from './HistoryTable.jsx';
import { statusOf } from '../lib/status.js';
import { useAuth } from './auth/AuthContext.jsx';

const LOGO_URL = '/mpower-logo.png';

export default function MonitoringDashboard({ appSwitcher = null }) {
  const { user, logout } = useAuth();
  const [sid, setSid] = useState('MSD');
  const [view, setView] = useState('snapshot');
  const [priorityFilter, setPriorityFilter] = useState('all');

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
  const landscapeMap = new Map((dashboard.landscape || []).map((l) => [l.sid, l]));

  return (
    <div className="dashboard-container">
      {/* 1. TOP HEADER SECTION */}
      <header className="top-header">
        <div className="header-brand">
          <img className="header-logo" src={LOGO_URL} alt="M Power" />
        </div>

        <div className="header-center">
          {appSwitcher && <div className="header-app-switcher">{appSwitcher}</div>}
          <h1 className="dashboard-title">SAP Basis Command Center</h1>
        </div>

        <div className="header-actions">
          <span className="refresh-note">
            Last refresh: {new Date(dashboard.generatedAt).toLocaleString('en-GB')}
          </span>
          {user && (
            <div className="user-profile-badge">
              <span className="user-avatar">{user.avatar || 'U'}</span>
              <div className="user-info">
                <span className="user-name">{user.name}</span>
                <span className="user-role">{user.role}</span>
              </div>
              <button
                type="button"
                className="logout-btn"
                onClick={logout}
                title="Sign out of SAP Basis Monitoring"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z"
                    clipRule="evenodd"
                  />
                  <path
                    fillRule="evenodd"
                    d="M6 10a.75.75 0 01.75-.75h9.546l-2.028-1.97a.75.75 0 011.06-1.06l3.3 3.208a.75.75 0 010 1.066l-3.3 3.208a.75.75 0 01-1.06-1.06l2.028-1.972H6.75A.75.75 0 016 10z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* DASHBOARD BODY (SIDEBAR + MAIN CONTENTS) */}
      <div className="dashboard-body">
        {/* 2. SIDEBAR SECTION */}
        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-section-title">SAP Systems ({dashboard.systems.length})</div>
            <nav className="sidebar-nav" aria-label="System navigation">
              {dashboard.systems.map((system) => {
                const isSelected = system.sid === sid;
                const info = landscapeMap.get(system.sid);
                const hasAlerts = info?.openAlerts > 0;
                return (
                  <button
                    key={system.sid}
                    type="button"
                    className={`sidebar-nav-item ${isSelected ? 'active' : ''}`}
                    onClick={() => setSid(system.sid)}
                    aria-current={isSelected ? 'page' : undefined}
                  >
                    <span
                      className={`status-dot ${hasAlerts ? 'warning' : 'good'}`}
                      title={hasAlerts ? `${info.openAlerts} open issues` : 'Healthy'}
                    />
                    <div className="nav-item-content">
                      <div className="nav-item-sid">{system.sid}</div>
                      <div className="nav-item-name">{system.name}</div>
                    </div>
                    {info && (
                      <span className="nav-item-badge" title="Health Score">
                        {info.score}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="sidebar-footer">
            <div className="refresh-note">
              Refreshed: {new Date(dashboard.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </aside>

        {/* 3. CONTENTS SECTION */}
        <main className="main-content">
          {/* Scope bar */}
          <div className="scopebar">
            <label className="scope-chip">
              <span className="scope-chip-label">Priority Filter</span>
              <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                <option value="all">All Priorities</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning / Serious</option>
                <option value="good">Healthy (Green)</option>
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

          {/* System identity row */}
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
                  priorityFilter={priorityFilter}
                />
                <TrendPanel trends={dashboard.trends} sid={card.sid} />
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
      </div>
    </div>
  );
}
