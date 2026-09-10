'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { AlertsBell } from './AlertsBell.jsx';
import { MetricsOverview } from './MetricsOverview.jsx';
import { TrendPanel } from './TrendPanel.jsx';
import { HistoryTable } from './HistoryTable.jsx';
import { MetricDetailDialog } from './MetricDetailDialog.jsx';
import { statusOf } from '../lib/status.js';
import { useAuth } from './auth/AuthContext.jsx';
import { paramTile, volumeTile, endpointTile } from '../lib/tiles.js';

const LOGO_URL = '/mpower-logo.png';

export default function MonitoringDashboard({ appSwitcher = null }) {
  const { user, logout } = useAuth();
  const [sid, setSid] = useState('MSD');
  const [view, setView] = useState('snapshot');
  const [layoutMode, setLayoutMode] = useState('tiles'); // 'tiles' | 'list'
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [openTile, setOpenTile] = useState(null);

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

  const allTiles = [
    ...(dashboard.endpoints || []).map(endpointTile),
    ...[card.dataVol, card.logVol, card.freeApp, card.freeDb].filter(Boolean).map((m) =>
      volumeTile(m, { pie: true })
    ),
    ...(card.params || []).map(paramTile),
  ];

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
          {user && (
            <div className="user-profile-badge">
              <div className="user-avatar" title={`Logged in as ${user.name}`}>
                {user.name.charAt(0).toUpperCase()}
              </div>
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

            {/* Desktop Navigation */}
            <nav className="sidebar-nav" aria-label="System navigation">
              {dashboard.systems.map((system) => {
                const isSelected = system.sid === sid;
                const info = landscapeMap.get(system.sid);
                const alertCount = info ? (info.openAlerts > 0 ? info.openAlerts : (info.windowAlerts > 0 ? info.windowAlerts : 0)) : 0;
                const hasAlerts = alertCount > 0;
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
                      title={hasAlerts ? `${alertCount} open alerts` : 'Healthy'}
                    />
                    <div className="nav-item-content">
                      <div className="nav-item-sid">{system.sid}</div>
                    </div>
                    {info && (
                      <span
                        className={`sidebar-alert-badge ${hasAlerts ? 'has-alerts' : 'healthy'}`}
                        title={hasAlerts ? `${alertCount} open alerts` : 'Healthy (0 alerts)'}
                      >
                        {alertCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Mobile System Selector */}
            <div className="mobile-system-selector">
              <div className="mobile-select-wrapper">
                <select
                  id="mobile-sid-select"
                  className="mobile-select-dropdown"
                  value={sid}
                  onChange={(e) => setSid(e.target.value)}
                  aria-label="Select SAP System"
                >
                  {dashboard.systems.map((system) => {
                    const info = landscapeMap.get(system.sid);
                    const alertCount = info ? (info.openAlerts > 0 ? info.openAlerts : (info.windowAlerts > 0 ? info.windowAlerts : 0)) : 0;
                    const alertText = alertCount > 0 ? ` • ${alertCount} Alerts` : ' • Healthy';
                    return (
                      <option key={system.sid} value={system.sid}>
                        {system.sid} ({alertCount} alerts){alertText}
                      </option>
                    );
                  })}
                </select>
                <div className="mobile-select-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
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
              {dashboard.latestRun.label}, {new Date(dashboard.generatedAt).toLocaleTimeString('en-GB')}
            </span>

            <span className="filters-spacer" />
            <AlertsBell alerts={dashboard.alerts} sid={card.sid} allTiles={allTiles} onOpenDetail={setOpenTile} />
          </div>

          <nav className="breadcrumb" aria-label="Breadcrumb">
            <span>Home</span>
            <span aria-hidden="true">/</span>
            <span>Monitoring</span>
            <span aria-hidden="true">/</span>
            <span className="breadcrumb-current">{card.sid} - {card.name}</span>
          </nav>

          <div className="view-header-row">
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

            <div className="view-toggle-group" role="radiogroup" aria-label="Layout view mode">
              <button
                type="button"
                className={`view-toggle-btn ${layoutMode === 'tiles' ? 'active' : ''}`}
                onClick={() => {
                  if (view !== 'snapshot') setView('snapshot');
                  setLayoutMode('tiles');
                }}
                title="Tile View (Grid)"
                aria-checked={layoutMode === 'tiles'}
                role="radio"
              >
                <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M4.25 3A1.25 1.25 0 003 4.25v3.5C3 8.44 3.56 9 4.25 9h3.5A1.25 1.25 0 009 7.75v-3.5C9 3.56 8.44 3 7.75 3h-3.5zM12.25 3A1.25 1.25 0 0011 4.25v3.5c0 .69.56 1.25 1.25 1.25h3.5A1.25 1.25 0 0017 7.75v-3.5C17 3.56 16.44 3 15.75 3h-3.5zM4.25 11A1.25 1.25 0 003 12.25v3.5C3 16.44 3.56 17 4.25 17h3.5A1.25 1.25 0 009 15.75v-3.5C9 11.56 8.44 11 7.75 11h-3.5zM12.25 11A1.25 1.25 0 0011 12.25v3.5c0 .69.56 1.25 1.25 1.25h3.5A1.25 1.25 0 0017 15.75v-3.5C17 11.56 16.44 11 15.75 11h-3.5z" />
                </svg>
                <span>Tile View</span>
              </button>
              <button
                type="button"
                className={`view-toggle-btn ${layoutMode === 'list' ? 'active' : ''}`}
                onClick={() => {
                  if (view !== 'snapshot') setView('snapshot');
                  setLayoutMode('list');
                }}
                title="List View (Table)"
                aria-checked={layoutMode === 'list'}
                role="radio"
              >
                <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M3 4.75A.75.75 0 013.75 4h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 4.75zm0 10.5a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75zm0-5.25a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                </svg>
                <span>List View</span>
              </button>
            </div>
          </div>

          <div className={loading && hasRendered.current ? 'is-stale' : undefined}>
            {view === 'snapshot' ? (
              <>
                <MetricsOverview
                  card={card}
                  endpoints={dashboard.endpoints}
                  runLabel={`${dashboard.latestRun.label}, ${new Date(dashboard.generatedAt).toLocaleTimeString('en-GB')}`}
                  priorityFilter={priorityFilter}
                  layoutMode={layoutMode}
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

          {openTile && (
            <MetricDetailDialog
              key={openTile.key}
              tile={openTile}
              sid={card.sid}
              systemName={card.name}
              runLabel={`${dashboard.latestRun.label}, ${new Date(dashboard.generatedAt).toLocaleTimeString('en-GB')}`}
              onClose={() => setOpenTile(null)}
            />
          )}

          <footer className="dashboard-footer">
            © 2026 APx Technology, LLP.
          </footer>
        </main>
      </div>
    </div>
  );
}
