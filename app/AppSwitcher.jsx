'use client';

import { useState } from 'react';
import MonitoringDashboard from '../components/MonitoringDashboard.jsx';
import { Dashboard as BatchJobMonitor } from '../components/batch/Dashboard';

const APPS = [
  { key: 'monitoring', label: 'Landscape Health' },
  { key: 'batch', label: 'Batch Job Monitor' },
];

export default function AppSwitcher() {
  const [app, setApp] = useState('monitoring');

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
      {app === 'monitoring' ? <MonitoringDashboard /> : <BatchJobMonitor />}
    </>
  );
}
