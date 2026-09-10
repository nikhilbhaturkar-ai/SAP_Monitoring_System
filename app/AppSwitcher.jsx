'use client';

import { useState } from 'react';
import MonitoringDashboard from '../components/MonitoringDashboard.jsx';
import { Dashboard as BatchJobMonitor } from '../components/batch/Dashboard';
import { AuthProvider, useAuth } from '../components/auth/AuthContext.jsx';
import LoginPage from '../components/auth/LoginPage.jsx';

const ALL_APPS = [
  { key: 'monitoring', label: 'Landscape Health' },
  { key: 'batch', label: 'Batch Job Monitor' },
];

function ProtectedDashboardContent({ showBatchJobMonitorTab }) {
  const { user, loading } = useAuth();
  const [app, setApp] = useState('monitoring');

  if (loading) {
    return (
      <main className="shell">
        <div className="card state-panel">Loading session...</div>
      </main>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const APPS = showBatchJobMonitorTab
    ? ALL_APPS
    : ALL_APPS.filter((a) => a.key !== 'batch');

  const appSwitcherNav = (
    <nav className="app-switcher" aria-label="Application">
      {APPS.map((a) => (
        <button
          key={a.key}
          type="button"
          className={`app-switcher-tab${app === a.key ? ' is-active' : ''}`}
          onClick={() => setApp(a.key)}
        >
          {a.label}
        </button>
      ))}
    </nav>
  );

  return app === 'batch' && showBatchJobMonitorTab ? (
    <>
      <div style={{ padding: '16px 32px 0' }}>{appSwitcherNav}</div>
      <BatchJobMonitor />
    </>
  ) : (
    <MonitoringDashboard appSwitcher={showBatchJobMonitorTab ? appSwitcherNav : null} />
  );
}

export default function AppSwitcher({ showBatchJobMonitorTab = false }) {
  return (
    <AuthProvider>
      <ProtectedDashboardContent showBatchJobMonitorTab={showBatchJobMonitorTab} />
    </AuthProvider>
  );
}
