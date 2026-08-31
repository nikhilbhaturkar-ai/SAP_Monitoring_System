'use client';

import { useState } from 'react';
import MonitoringDashboard from '../components/MonitoringDashboard.jsx';
import { Dashboard as BatchJobMonitor } from '../components/batch/Dashboard';

const ALL_APPS = [
  { key: 'monitoring', label: 'Landscape Health' },
  { key: 'batch', label: 'Batch Job Monitor' },
];

export default function AppSwitcher({ showBatchJobMonitorTab = false }) {
  const [app, setApp] = useState('monitoring');
  const APPS = showBatchJobMonitorTab
    ? ALL_APPS
    : ALL_APPS.filter((a) => a.key !== 'batch');

  return (
    <>
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
      {app === 'batch' && showBatchJobMonitorTab ? <BatchJobMonitor /> : <MonitoringDashboard />}
    </>
  );
}
