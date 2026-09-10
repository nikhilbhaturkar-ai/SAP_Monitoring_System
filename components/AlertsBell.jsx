'use client';

import { useState, useRef, useEffect } from 'react';
import { StatusDot } from './StatusChip.jsx';

/**
 * Compact bell replacing the old "N issues today" chip. Active alerts move
 * into a click/hover popup so the scope bar stays a single line.
 * Clicking any active alert opens its detailed modal payload.
 */
export function AlertsBell({ alerts, sid, allTiles = [], onOpenDetail = null }) {
  const [isOpen, setIsOpen] = useState(false);
  const bellRef = useRef(null);
  const active = alerts?.active ?? [];
  const hasActive = active.length > 0;

  useEffect(() => {
    function handleClickOutside(event) {
      if (bellRef.current && !bellRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const tileMap = new Map((allTiles || []).map((t) => [t.key, t]));

  const handleAlertClick = (alert, index) => {
    setIsOpen(false);
    if (typeof onOpenDetail === 'function') {
      const existingTile = tileMap.get(alert.checkKey) || allTiles.find((t) => t.label === alert.label);
      const tile = existingTile || {
        key: alert.checkKey || `alert-${index}`,
        label: alert.label,
        value: alert.value,
        status: alert.severity || 'warning',
        statusLabel: 'Attention',
        hint: `Flagged alert on ${alert.dateShort}: ${alert.value}`,
        detail: {
          isAnomaly: true,
          normalText: alert.label,
          readings: [{ date: alert.date, dateShort: alert.dateShort, value: alert.value, isAnomaly: true }],
        },
      };
      onOpenDetail(tile);
    }
  };

  return (
    <div className="alerts-bell" ref={bellRef}>
      <button
        type="button"
        className={`alerts-bell-trigger${hasActive ? ' has-active' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={hasActive ? `${active.length} active alerts` : 'No active alerts'}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2a1 1 0 0 1 1 1v1.06c3.39.49 6 3.4 6 6.94v4l1.6 2.13a1 1 0 0 1-.8 1.6H8.2a5.8 5.8 0 0 0 3.6 1.27 5.8 5.8 0 0 0 3.14-.92 1 1 0 1 1 1.08 1.68A7.8 7.8 0 0 1 8.06 20a1 1 0 0 1 .17-1.98A3.79 3.79 0 0 1 8 17.6l-3.8.05a1 1 0 0 1-.8-1.6L5 13.94v-4c0-3.55 2.61-6.45 6-6.94V2a1 1 0 0 1 1-1Z"
          />
        </svg>
        {hasActive && <span className="alerts-bell-badge">{active.length}</span>}
      </button>

      <div className={`alerts-bell-popup${isOpen ? ' is-open' : ''}`} role="dialog" aria-label="Active alerts">
        <div className="alerts-bell-popup-title">
          {hasActive ? `${active.length} active alert${active.length > 1 ? 's' : ''}` : 'No active alerts'}
        </div>

        {hasActive ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {active.map((alert, i) => (
              <div
                className="alert-row is-clickable"
                key={`${alert.date}-${alert.label}-${i}`}
                onClick={() => handleAlertClick(alert, i)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleAlertClick(alert, i);
                  }
                }}
                title={`Click to view details for ${alert.label}`}
              >
                <StatusDot status={alert.severity} srLabel={alert.severity} />
                <span className="alert-date">{alert.dateShort}</span>
                <span className="alert-body">
                  <strong>{alert.label}</strong> — {alert.value}
                </span>
                <span className="alert-link-action">
                  Details &rarr;
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            All monitored parameters for <strong>{sid}</strong> were within normal range on the
            latest run.
          </p>
        )}
      </div>
    </div>
  );
}
