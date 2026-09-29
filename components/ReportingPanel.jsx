'use client';

import { useState, useEffect } from 'react';

const ALL_CHECKS = [
  { key: 'dataVol',        label: 'DBA Cockpit — Data Volume',                group: 'Basis' },
  { key: 'logVol',         label: 'DBA Cockpit — Log Volume',                 group: 'Basis' },
  { key: 'st22',           label: 'ST22 — ABAP Runtime Errors',               group: 'Basis' },
  { key: 'backup',         label: 'Backup',                                   group: 'Basis' },
  { key: 'sm13',           label: 'SM13 — Update Requests',                   group: 'Basis' },
  { key: 'sm12',           label: 'SM12 — Lock Entries',                      group: 'Basis' },
  { key: 'sm51',           label: 'SM51 — Application Servers',               group: 'Basis' },
  { key: 'sm50',           label: 'SM50 — Work Process List',                 group: 'Basis' },
  { key: 'st06',           label: 'ST06 — OS Monitoring',                     group: 'Basis' },
  { key: 'sm37',           label: 'SM37 — Background Jobs',                   group: 'Basis' },
  { key: 'smq1',           label: 'SMQ1 — Outbound Queues',                   group: 'Basis' },
  { key: 'smq2',           label: 'SMQ2 — Inbound Queues',                    group: 'Basis' },
  { key: 'sm20',           label: 'SM20 — Security Audit Log',                group: 'Basis' },
  { key: 'sm21',           label: 'SM21 — System Log',                        group: 'Basis' },
  { key: 'sm58',           label: 'SM58 — Transactional RFC',                 group: 'Basis' },
  { key: 'cancel',         label: 'Cancelled Jobs',                           group: 'Basis' },
  { key: 'strust',         label: 'STRUST — SSL Certificates Expired',        group: 'Basis' },
  { key: 'strustToday',    label: 'STRUST — SSL Expiring Today',              group: 'Basis' },
  { key: 'strust15d',      label: 'STRUST — SSL Expiring in 15 Days',         group: 'Basis' },
  { key: 'freeApp',        label: 'Free Memory — App Server',                 group: 'Basis' },
  { key: 'freeDb',         label: 'Free Memory — Database',                   group: 'Basis' },
  { key: 'urlStatus',      label: 'Endpoint Availability',                    group: 'Basis' },
  { key: 'locked',         label: 'Locked Users',                             group: 'Security' },
  { key: 'inactive',       label: 'Inactive Users',                           group: 'Security' },
  { key: 'highPriv',       label: 'High Privilege Users',                     group: 'Security' },
  { key: 'unassignedRoles',label: 'Unassigned Roles',                         group: 'Security' },
  { key: 'ghostRoles',     label: 'Unused Roles (Ghost)',                     group: 'Security' },
  { key: 'unusedProfiles', label: 'Unused Profiles',                          group: 'Security' },
  { key: 'unusedTcodes',   label: 'Unused T-Codes',                           group: 'Security' },
  { key: 'undeletedUsers', label: 'Undeleted Users',                          group: 'Security' },
  { key: 'redundantRoles', label: 'Redundant Roles',                          group: 'Security' },
  { key: 'emptyShell',     label: 'Empty Shell Users',                        group: 'Security' },
];

const today = () => new Date().toISOString().slice(0, 10);

export function ReportingPanel({ sid }) {
  const [dateFrom,    setDateFrom]    = useState(today());
  const [dateTo,      setDateTo]      = useState(today());
  const [format,      setFormat]      = useState('excel');
  const [selectAll,   setSelectAll]   = useState(true);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [loading,     setLoading]     = useState(false);
  const [msg,         setMsg]         = useState(null);

  // when switching to selectAll, clear individual selection
  const handleSelectAll = (v) => {
    setSelectAll(v);
    if (v) setSelectedKeys(new Set());
  };

  const toggleKey = (key) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setSelectAll(false);
  };

  const toggleGroup = (group, checks) => {
    const groupKeys = checks.filter(c => c.group === group).map(c => c.key);
    const allIn = groupKeys.every(k => selectedKeys.has(k));
    setSelectedKeys(prev => {
      const next = new Set(prev);
      groupKeys.forEach(k => allIn ? next.delete(k) : next.add(k));
      return next;
    });
    setSelectAll(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg(null);

    if (dateFrom > dateTo) {
      setMsg({ type: 'error', text: '"Date From" must be on or before "Date To".' });
      return;
    }

    setLoading(true);
    try {
      const body = {
        sid,
        dateFrom,
        dateTo,
        tileKeys: selectAll ? [] : [...selectedKeys],
        format,
      };

      const res = await fetch('/api/export/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }

      if (format === 'excel') {
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `SAP_Report_${sid}_${dateFrom}_to_${dateTo}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setMsg({ type: 'success', text: 'Excel report downloaded successfully.' });
      } else {
        const html = await res.text();
        const blob = new Blob([html], { type: 'text/html' });
        const url  = URL.createObjectURL(blob);
        const win  = window.open(url, '_blank');
        if (win) {
          win.onload = () => { win.focus(); win.print(); };
        }
        setMsg({ type: 'success', text: 'PDF print dialog opened in a new tab.' });
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const groups = ['Basis', 'Security'];

  return (
    <div className="reporting-panel">
      <div className="reporting-header">
        <div>
          <h2 className="reporting-title">Generate Report</h2>
          <p className="reporting-subtitle">
            Select a date range, the tiles to include, and a format. The report will download automatically.
          </p>
        </div>
      </div>

      {msg && (
        <div className={`reporting-msg reporting-msg-${msg.type}`}>
          {msg.type === 'success' ? '✓' : '✗'} {msg.text}
        </div>
      )}

      <form className="reporting-form" onSubmit={handleSubmit}>
        {/* ── Date Range ──────────────────────────────────── */}
        <section className="reporting-section">
          <h3 className="reporting-section-title">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
            </svg>
            Date Range
          </h3>
          <div className="reporting-date-row">
            <div className="reporting-field">
              <label htmlFor="rpt-from">From</label>
              <input
                id="rpt-from"
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={e => setDateFrom(e.target.value)}
                className="reporting-input"
                required
              />
            </div>
            <div className="reporting-date-sep">→</div>
            <div className="reporting-field">
              <label htmlFor="rpt-to">To</label>
              <input
                id="rpt-to"
                type="date"
                value={dateTo}
                min={dateFrom}
                max={today()}
                onChange={e => setDateTo(e.target.value)}
                className="reporting-input"
                required
              />
            </div>
            <button
              type="button"
              className="reporting-preset-btn"
              onClick={() => { setDateFrom(today()); setDateTo(today()); }}
            >Today</button>
            <button
              type="button"
              className="reporting-preset-btn"
              onClick={() => {
                const d = new Date(); d.setDate(d.getDate() - 6);
                setDateFrom(d.toISOString().slice(0, 10));
                setDateTo(today());
              }}
            >Last 7 days</button>
            <button
              type="button"
              className="reporting-preset-btn"
              onClick={() => {
                const d = new Date(); d.setDate(d.getDate() - 29);
                setDateFrom(d.toISOString().slice(0, 10));
                setDateTo(today());
              }}
            >Last 30 days</button>
          </div>
        </section>

        {/* ── Tile Selection ───────────────────────────────── */}
        <section className="reporting-section">
          <h3 className="reporting-section-title">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path d="M4.25 3A1.25 1.25 0 003 4.25v3.5C3 8.44 3.56 9 4.25 9h3.5A1.25 1.25 0 009 7.75v-3.5C9 3.56 8.44 3 7.75 3h-3.5zM12.25 3A1.25 1.25 0 0011 4.25v3.5c0 .69.56 1.25 1.25 1.25h3.5A1.25 1.25 0 0017 7.75v-3.5C17 3.56 16.44 3 15.75 3h-3.5zM4.25 11A1.25 1.25 0 003 12.25v3.5C3 16.44 3.56 17 4.25 17h3.5A1.25 1.25 0 009 15.75v-3.5C9 11.56 8.44 11 7.75 11h-3.5zM12.25 11A1.25 1.25 0 0011 12.25v3.5c0 .69.56 1.25 1.25 1.25h3.5A1.25 1.25 0 0017 15.75v-3.5C17 11.56 16.44 11 15.75 11h-3.5z" />
            </svg>
            Tiles to Include
          </h3>

          <label className="reporting-all-label">
            <input
              type="checkbox"
              checked={selectAll}
              onChange={e => handleSelectAll(e.target.checked)}
            />
            <span>All tiles <span className="reporting-badge">{ALL_CHECKS.length}</span></span>
          </label>

          {!selectAll && (
            <div className="reporting-tiles-grid">
              {groups.map(group => {
                const groupChecks = ALL_CHECKS.filter(c => c.group === group);
                const allGroupIn = groupChecks.every(c => selectedKeys.has(c.key));
                return (
                  <div key={group} className="reporting-tile-group">
                    <div className="reporting-group-header">
                      <label className="reporting-group-label">
                        <input
                          type="checkbox"
                          checked={allGroupIn}
                          onChange={() => toggleGroup(group, ALL_CHECKS)}
                        />
                        <span className="reporting-group-name">{group} Monitoring</span>
                        <span className="reporting-badge">{groupChecks.length}</span>
                      </label>
                    </div>
                    <div className="reporting-check-list">
                      {groupChecks.map(c => (
                        <label key={c.key} className="reporting-check-item">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(c.key)}
                            onChange={() => toggleKey(c.key)}
                          />
                          <span>{c.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!selectAll && selectedKeys.size === 0 && (
            <p className="reporting-warn">Select at least one tile, or enable "All tiles".</p>
          )}
        </section>

        {/* ── Format ───────────────────────────────────────── */}
        <section className="reporting-section">
          <h3 className="reporting-section-title">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.379 2H4.5zm4.75 6.75a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5h-2.5zm-2.5 3a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5zm-1.25 3a.75.75 0 01.75-.75h5a.75.75 0 010 1.5h-5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
            </svg>
            Report Format
          </h3>
          <div className="reporting-format-row">
            <label className={`reporting-format-card ${format === 'excel' ? 'active' : ''}`}>
              <input
                type="radio"
                name="format"
                value="excel"
                checked={format === 'excel'}
                onChange={() => setFormat('excel')}
              />
              <div className="reporting-format-icon reporting-format-icon-excel">
                <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
                  <rect width="24" height="24" rx="4" fill="#217346"/>
                  <text x="4" y="17" fill="white" fontSize="13" fontWeight="bold" fontFamily="Arial">XL</text>
                </svg>
              </div>
              <div>
                <div className="reporting-format-name">Excel (.xlsx)</div>
                <div className="reporting-format-desc">4-sheet workbook — summary, observations, anomalies & daily pivot</div>
              </div>
            </label>

            <label className={`reporting-format-card ${format === 'pdf' ? 'active' : ''}`}>
              <input
                type="radio"
                name="format"
                value="pdf"
                checked={format === 'pdf'}
                onChange={() => setFormat('pdf')}
              />
              <div className="reporting-format-icon reporting-format-icon-pdf">
                <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
                  <rect width="24" height="24" rx="4" fill="#e53935"/>
                  <text x="3" y="17" fill="white" fontSize="11" fontWeight="bold" fontFamily="Arial">PDF</text>
                </svg>
              </div>
              <div>
                <div className="reporting-format-name">PDF (Print)</div>
                <div className="reporting-format-desc">Opens a print-ready HTML report in a new tab for browser PDF save</div>
              </div>
            </label>
          </div>
        </section>

        {/* ── Submit ───────────────────────────────────────── */}
        <div className="reporting-submit-row">
          <button
            type="submit"
            className="reporting-submit-btn"
            disabled={loading || (!selectAll && selectedKeys.size === 0)}
          >
            {loading ? (
              <><span className="reporting-spinner" />Generating report…</>
            ) : (
              <>
                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v8.69l1.97-1.97a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L6.22 11.53a.75.75 0 111.06-1.06l1.97 1.97V3.75A.75.75 0 0110 3zm-6.5 12.25a.75.75 0 000 1.5h13a.75.75 0 000-1.5h-13z" clipRule="evenodd" />
                </svg>
                Download {format === 'excel' ? 'Excel' : 'PDF'} Report
              </>
            )}
          </button>
          <span className="reporting-hint">
            {selectAll ? `All ${ALL_CHECKS.length} tiles` : `${selectedKeys.size} tile${selectedKeys.size !== 1 ? 's' : ''}`}
            {' · '}{dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`}
            {' · '}{format.toUpperCase()}
          </span>
        </div>
      </form>
    </div>
  );
}
