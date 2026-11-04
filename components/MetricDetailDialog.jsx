'use client';

import { useEffect, useRef, useState } from 'react';
import { StatusChip, StatusDot } from './StatusChip.jsx';

const NUMERIC_RE = /^\d+$/;

// Checks whose dialog shows only their own row list (job/cert/queue/audit
// detail) — the generic anomaly facts (source, flagged-since, why-flagged)
// don't apply to a table of rows the way they do to a single reading.
const ROW_LIST_CHECKS = new Set([
  'sm37',
  'cancel',
  'strust',
  'strustToday',
  'strust15d',
  'smq1',
  'smq2',
  'sm20',
  'sm21',
  'sm58',
  'locked',
  'inactive',
  'highPriv',
  'unassignedRoles',
  'ghostRoles',
  'unusedProfiles',
  'unusedTcodes',
  'undeletedUsers',
  'redundantRoles',
  'emptyShell',
]);

/**
 * One entry per check that carries row-level detail behind its count/status.
 * `columns` are the table headers; `cells(row)` returns the matching values in
 * the same order. Adding a fifth such check is one entry here — the render
 * logic below stays generic.
 */
const DETAIL_TABLE_SPECS = {
  st22: {
    heading: (n) => `Runtime errors (${n})`,
    caption: (sid) => `ST22 runtime dumps for ${sid}, most recent first`,
    columns: ['When', 'Dump ID', 'Program', 'User', 'Host'],
    cells: (d) => [
      <>
        {d.date ?? '—'}
        {d.time && <span className="detail-sub"> {d.time}</span>}
      </>,
      d.dumpId ?? '—',
      <>
        {d.program ?? '—'}
        {d.include && d.include !== d.program && (
          <span className="detail-sub">
            {' '}
            / {d.include}
            {d.line ? `:${d.line}` : ''}
          </span>
        )}
      </>,
      d.user ?? '—',
      d.host ?? '—',
    ],
  },
  backup: {
    heading: (n) => `Backup log (${n})`,
    caption: (sid) => `Backup runs for ${sid}, most recent first`,
    columns: ['Type', 'Started', 'Ended', 'State'],
    cells: (b) => {
      // entry_state from Z_BACKUP_SRV is literally "successful" or "failed" —
      // same colour + glyph + label convention as every other status in this
      // dashboard (StatusDot), not just plain text, so a failed run stands out
      // in the log without reading every row.
      const isSuccess = /success/i.test(b.state || '');
      return [
        b.type ?? '—',
        b.start ?? '—',
        b.end ?? '—',
        <>
          <StatusDot
            status={isSuccess ? 'ok' : 'critical'}
            srLabel={isSuccess ? 'Successful' : 'Failed'}
          />
          {b.state ?? '—'}
        </>,
      ];
    },
  },
  sm12: {
    heading: (n) => `Active lock entries (${n})`,
    caption: (sid) => `SM12 active lock entries for ${sid}`,
    columns: ['User', 'Table', 'Mode', 'Held since'],
    cells: (l) => [
      l.user ?? '—',
      l.table ?? '—',
      l.mode ?? '—',
      l.durationHrs != null ? `${l.time ?? '—'} (${l.durationHrs}h)` : (l.time ?? '—'),
    ],
  },
  sm51: {
    heading: (n) => `Application servers (${n})`,
    caption: (sid) => `SM51 server list for ${sid}`,
    columns: ['Server', 'Host', 'Address'],
    cells: (s) => [s.name ?? '—', s.hostLong ?? s.host ?? '—', s.hostAddr ?? '—'],
  },
  sm50: {
    heading: (n) => `Work processes (${n})`,
    caption: (sid) => `SM50 work process list for ${sid}`,
    columns: ['Server Name', 'STATE_DISP', 'PID', 'WP_TYPE_DISP', 'WAIT_FOR_PRIORITY_DISP'],
    cells: (w) => [
      w.server ?? '—',
      w.status ?? '—',
      w.pid ?? '—',
      w.type ?? '—',
      w.waitPriority ?? '—',
    ],
  },
  sm37: {
    heading: (n) => `Background jobs (${n})`,
    caption: (sid) => `SM37 long-running jobs for ${sid}`,
    columns: ['Job name', 'Schedule start date', 'Schedule start time'],
    cells: (j) => [j.jobName ?? '—', j.schedDate ?? '—', j.schedTime ?? '—'],
  },
  cancel: {
    heading: (n) => `Cancelled jobs (${n})`,
    caption: (sid) => `Cancelled background jobs for ${sid}`,
    columns: [
      'Job name',
      'Scheduled start date',
      'Scheduled time',
      'User Name',
      'Status',
      'Job Log',
      'WP Process',
      'BTCSYSREAX',
      'REAXSERVER',
    ],
    cells: (c) => [
      c.jobName ?? '—',
      c.schedDate ?? '—',
      c.schedTime ?? '—',
      c.userName ?? '—',
      c.status === 'C' ? 'Cancelled' : (c.status ?? '—'),
      c.jobLog ?? '—',
      c.wpProcess ?? '—',
      c.btcsysreax ?? '—',
      c.reaxserver ?? '—',
    ],
  },
  strust: {
    heading: (n) => `Expired certificates (${n})`,
    caption: (sid) => `Expired SSL certificates for ${sid}`,
    columns: ['Certificate Name', 'Valid From', 'Valid To', 'Status'],
    cells: (c) => [c.certificate ?? '—', c.validFrom ?? '—', c.validTo ?? '—', c.result ?? '—'],
  },
  strustToday: {
    heading: (n) => `Certificates expiring today (${n})`,
    caption: (sid) => `SSL certificates expiring today for ${sid}`,
    columns: ['Certificate Name', 'Valid From', 'Valid To', 'Status'],
    cells: (c) => [c.certificate ?? '—', c.validFrom ?? '—', c.validTo ?? '—', c.result ?? '—'],
  },
  strust15d: {
    heading: (n) => `Certificates expiring in 15 days (${n})`,
    caption: (sid) => `SSL certificates expiring within 15 days for ${sid}`,
    columns: ['Certificate Name', 'Valid From', 'Valid To', 'Status'],
    cells: (c) => [c.certificate ?? '—', c.validFrom ?? '—', c.validTo ?? '—', c.result ?? '—'],
  },
  smq1: {
    heading: (n) => `Outbound error queues (${n})`,
    caption: (sid) => `SMQ1 outbound error queues for ${sid}`,
    columns: ['ARFCIPID', 'ARFCPID', 'Queue Name', 'QRFCFNAM', 'Date', 'Error Message'],
    cells: (q) => [
      q.arfcipid ?? '—',
      q.arfcpid ?? '—',
      q.queueName ?? '—',
      q.rfcFunction ?? '—',
      q.rfcDate ?? '—',
      q.errorMessage ?? '—',
    ],
  },
  smq2: {
    heading: (n) => `Inbound error queues (${n})`,
    caption: (sid) => `SMQ2 inbound error queues for ${sid}`,
    columns: ['ARFCIPID', 'ARFCPID', 'Queue Name', 'QRFCFNAM', 'Date', 'Error Message'],
    cells: (q) => [
      q.arfcipid ?? '—',
      q.arfcpid ?? '—',
      q.queueName ?? '—',
      q.rfcFunction ?? '—',
      q.rfcDate ?? '—',
      q.errorMessage ?? '—',
    ],
  },
  sm20: {
    heading: (n) => `Audit files (${n})`,
    caption: (sid) => `SM20 audit files for ${sid}`,
    columns: ['Instance Name', 'File Name', 'Output'],
    cells: (a) => [a.instanceName ?? '—', a.fileName ?? '—', a.outputText ?? '—'],
  },
  sm21: {
    heading: (n) => `System log entries (${n})`,
    caption: (sid) => `SM21 system log entries for ${sid}`,
    columns: ['Date/Time', 'Instance', 'Priority', 'Error', 'SLGDATA'],
    cells: (l) => [
      l.logDate || l.logTime ? `${l.logDate ?? '—'}: ${l.logTime ?? '—'}` : '—',
      l.instanceName ?? '—',
      l.priorityIcon ?? '—',
      l.messageText ?? '—',
      l.slgData ?? '—',
    ],
  },
  locked: {
    heading: (n) => `Locked users (${n})`,
    caption: (sid) => `Locked SAP users for ${sid}`,
    columns: ['Username (BNAME)', 'First Name', 'Last Name'],
    cells: (u) => [u.userName ?? '—', u.firstName ?? '—', u.lastName ?? '—'],
  },
  emptyShell: {
    heading: (n) => `Empty shell users (${n})`,
    caption: (sid) => `Users with expired or no roles for ${sid}`,
    columns: ['BNAME', 'AGR_NAME', 'User Valid', 'Role Valid', 'Status'],
    cells: (u) => [
      u.userName ?? '—',
      u.agrName || '—',
      u.userValid || '—',
      u.roleValid || '—',
      u.status ?? '—',
    ],
  },
  ghostRoles: {
    heading: (n) => `Unused roles (${n})`,
    caption: (sid) => `Unused SAP roles for ${sid}`,
    columns: ['BNAME', 'AGR_NAME', 'Status'],
    cells: (r) => [r.userName ?? '—', r.roleName ?? '—', r.status ?? '—'],
  },
  unusedProfiles: {
    heading: (n) => `Unused profiles (${n})`,
    caption: (sid) => `Unused SAP profiles for ${sid}`,
    columns: ['AGR_NAME', 'Profile'],
    cells: (r) => [r.agrName ?? '—', r.profile ?? '—'],
  },
  unusedTcodes: {
    heading: (n) => `Unused T-Codes (${n})`,
    caption: (sid) => `Unused custom T-Codes for ${sid}`,
    columns: ['T-Code', 'AGR_NAME', 'Status'],
    cells: (r) => [r.tcode ?? '—', r.agrName ?? '—', r.status ?? '—'],
  },
  unassignedRoles: {
    heading: (n) => `Unassigned roles (${n})`,
    caption: (sid) => `Unassigned SAP roles for ${sid}`,
    columns: ['AGR_NAME'],
    cells: (r) => [r.roleName ?? '—'],
  },
  undeletedUsers: {
    heading: (n) => `Undeleted users (${n})`,
    caption: (sid) => `Users whose HR record is Retired/Left but SAP ID still exists in ${sid}`,
    columns: ['Username (BNAME)', 'First Name', 'Last Name', 'HR Status'],
    cells: (u) => [u.userName ?? '—', u.firstName ?? '—', u.lastName ?? '—', u.hrStatus ?? '—'],
  },
  redundantRoles: {
    heading: (n) => `Redundant single roles in composite roles (${n})`,
    caption: (sid) => `Composite roles with redundant single roles for ${sid}`,
    columns: ['Username (BNAME)', 'Composite Role', 'Single Role'],
    cells: (r) => [r.userName ?? '—', r.compositeRole ?? '—', r.singleRole ?? '—'],
  },
  inactive: {
    heading: (n) => `Inactive users (${n})`,
    caption: (sid) => `Inactive SAP users for ${sid}`,
    columns: ['Username (BNAME)', 'First Name', 'Last Name'],
    cells: (u) => [u.userName ?? '—', u.firstName ?? '—', u.lastName ?? '—'],
  },
  highPriv: {
    heading: (n) => `High privilege users (${n})`,
    caption: (sid) => `High privilege SAP users for ${sid}`,
    columns: ['Username (BNAME)', 'Profile', 'Client'],
    cells: (u) => [u.userName ?? '—', u.profile ?? '—', u.client ?? '—'],
  },
  sm58: {
    heading: (n) => `Pending tRFCs (${n})`,
    caption: (sid) => `SM58 pending tRFC list for ${sid}`,
    columns: [
      'ARFCIPID',
      'ARFCDEST',
      'ARFCFNAM',
      'ARFCTCODE',
      'ARFCRHOST',
      'ARFCMSG',
      'ARFCRESERV',
      'HASH',
    ],
    cells: (t) => [
      t.arfcipid ?? '—',
      t.arfcdest ?? '—',
      t.arfcfnam ?? '—',
      t.arfctcode ?? '—',
      t.arfcrhost ?? '—',
      t.arfcmsg ?? '—',
      t.arfcreserv ?? '—',
      t.hash ?? '—',
    ],
  },
};

/**
 * Everything the pipeline knows about one flagged check.
 *
 * A native <dialog> rather than a hand-rolled overlay: showModal() brings the
 * focus trap, the Escape key, inertness of the page behind it and the top-layer
 * stacking with it, none of which are worth reimplementing.
 *
 * Row-level detail (dump program, lock owner, server host, backup log entry,
 * …) renders only when the API actually attached `detail.detailRows` AND the
 * tile's key has an entry in DETAIL_TABLE_SPECS — today that's st22, backup,
 * sm12 and sm51, because those are the only tables holding rows like that.
 * Every other flagged check still has no such table, so the closing note
 * keeps pointing at the real transaction for those instead of inventing
 * fields.
 */
const DELETE_ROLE_URL = '/api/role-delete';
const UNUSED_ROLES_URL = '/api/unused-roles';
const DELETE_USER_URL = '/api/user-delete';

export function MetricDetailDialog({ tile, sid, systemName, runLabel, onClose }) {
  const ref = useRef(null);
  const [deleteStatus, setDeleteStatus] = useState({});
  const [deleteResponses, setDeleteResponses] = useState([]);
  const [liveDetailRows, setLiveDetailRows] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [userConfirm, setUserConfirm] = useState(null); // { userName } | null

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (!node.open) node.showModal();

    /*
     * Escape is handled here rather than through the dialog's own `cancel` /
     * `close` events. Those close the element natively without React hearing
     * about it, which leaves a closed <dialog> still mounted and the tile
     * unable to reopen it (verified: a listener attached to the element never
     * fires). Owning the key means the DOM and the state cannot disagree.
     */
    const handleKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('keydown', handleKey);
      if (node.open) node.close();
    };
  }, [onClose]);

  const detail = tile.detail ?? {};
  const readings = detail.readings ?? [];
  const rawDetailRows = detail.detailRows ?? null;
  // liveDetailRows is set after a delete refresh; fall back to the prop data
  const detailRows = liveDetailRows ?? rawDetailRows;
  const tableSpec = DETAIL_TABLE_SPECS[tile.key] ?? null;
  const hasDetailTable = tableSpec && detailRows && detailRows.length > 0;
  // Some checks (sm51) open their dialog as reference information on a
  // perfectly healthy reading — detail.isAnomaly, not tile.severity, is the
  // true signal, since severity is only ever set on an actual anomaly.
  const isAnomaly = Boolean(detail.isAnomaly);
  const severity = tile.severity === 'critical' ? 'critical' : 'warning';
  const normalTextIsCount = detail.normalText != null && NUMERIC_RE.test(String(detail.normalText));
  const isJobsCheck = ROW_LIST_CHECKS.has(tile.key);

  const refreshUnassignedRoles = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(UNUSED_ROLES_URL);
      if (res.ok) {
        const data = await res.json();
        // SAP returns an array of objects; normalise to { roleName } shape
        const rows = Array.isArray(data)
          ? data.map((item) => ({
              roleName: item.AGR_NAME ?? item.agr_name ?? item.roleName ?? item.ROLE_NAME ?? String(item),
            }))
          : [];
        setLiveDetailRows(rows);
      }
    } catch {
      // silently ignore refresh failures — the existing list stays visible
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeleteRole = async (roleName) => {
    setDeleteStatus((prev) => ({ ...prev, [roleName]: 'pending' }));
    try {
      const res = await fetch(DELETE_ROLE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ROLE_NAME: roleName }),
      });
      const text = await res.text();
      let display;
      try {
        const j = JSON.parse(text);
        display = typeof j === 'object' ? JSON.stringify(j, null, 2) : String(j);
      } catch {
        // Strip HTML tags and collapse whitespace for readable plain text
        display = text
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&copy;/gi, '©')
          .replace(/&[a-z]+;/gi, ' ')   // drop any remaining named entities
          .replace(/©.*?(rights reserved\.?|$)/i, '') // strip SAP copyright notice
          .replace(/\s+/g, ' ')
          .trim() || '(empty response)';
      }
      const success = res.ok;
      setDeleteStatus((prev) => ({ ...prev, [roleName]: success ? 'done' : 'error' }));
      setDeleteResponses((prev) => [
        { roleName, success, status: res.status, body: display, at: new Date().toLocaleTimeString() },
        ...prev,
      ]);
      // Refresh the roles list from SAP after every delete attempt
      await refreshUnassignedRoles();
    } catch (err) {
      setDeleteStatus((prev) => ({ ...prev, [roleName]: 'error' }));
      setDeleteResponses((prev) => [
        { roleName, success: false, status: null, body: err.message, at: new Date().toLocaleTimeString() },
        ...prev,
      ]);
    }
  };

  const handleDeleteUser = async (userName) => {
    setUserConfirm(null);
    setDeleteStatus((prev) => ({ ...prev, [userName]: 'pending' }));
    try {
      const res = await fetch(DELETE_USER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userName }),
      });
      const text = await res.text();
      let display;
      try {
        const j = JSON.parse(text);
        display = typeof j === 'object' ? JSON.stringify(j, null, 2) : String(j);
      } catch {
        display = text
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&copy;/gi, '©')
          .replace(/&[a-z]+;/gi, ' ')
          .replace(/©.*?(rights reserved\.?|$)/i, '')
          .replace(/\s+/g, ' ')
          .trim() || '(empty response)';
      }
      const success = res.ok;
      setDeleteStatus((prev) => ({ ...prev, [userName]: success ? 'done' : 'error' }));
      setDeleteResponses((prev) => [
        { roleName: userName, success, status: res.status, body: display, at: new Date().toLocaleTimeString() },
        ...prev,
      ]);
    } catch (err) {
      setDeleteStatus((prev) => ({ ...prev, [userName]: 'error' }));
      setDeleteResponses((prev) => [
        { roleName: userName, success: false, status: null, body: err.message, at: new Date().toLocaleTimeString() },
        ...prev,
      ]);
    }
  };

  // Clicking the backdrop lands on the dialog element itself, never on its
  // contents, which is what separates "outside" from "inside" here. It routes
  // through onClose (not node.close()) for the same reason Escape does.
  const handleClick = (event) => {
    if (event.target === ref.current) onClose();
  };

  return (
    <dialog
      ref={ref}
      className="detail-dialog"
      aria-labelledby="detail-dialog-title"
      onClick={handleClick}
    >
      <header className="detail-head">
        <div>
          <p className="detail-eyebrow">
            {sid} · {systemName}
          </p>
          <h2 className="detail-title" id="detail-dialog-title">
            {tile.label}
          </h2>
        </div>
        <button type="button" className="detail-close" onClick={onClose} aria-label="Close details">
          &#215;
        </button>
      </header>

      <div className="detail-banner">
        {/* No explicit label on the chip: it names its own severity, so the
            word, the glyph and the colour cannot disagree. A healthy check
            opened as reference (sm51) gets its real "ok" status here instead
            of borrowing the warning/critical vocabulary built for anomalies. */}
        <StatusChip status={isAnomaly ? severity : tile.status} />
        <span className="detail-reading">{tile.note ?? tile.value}</span>
      </div>

      <dl className="detail-facts">
        <div>
          <dt>Run</dt>
          <dd>{runLabel}</dd>
        </div>
        {!isJobsCheck &&
          (isAnomaly ? (
            <>
              <div>
                <dt>Flagged since</dt>
                <dd>
                  {detail.firstSeenShort ?? '—'}
                  {detail.consecutiveRuns > 1 && (
                    <span className="detail-sub"> · {detail.consecutiveRuns} runs in a row</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>In the last {detail.runsInWindow ?? 0} runs</dt>
                <dd>
                  {detail.occurrencesInWindow ?? 0}
                  <span className="detail-sub"> flagged</span>
                </dd>
              </div>
              <div className="detail-fact-wide">
                <dt>Why it is flagged</dt>
                <dd>
                  {normalTextIsCount ? (
                    <>
                      The count is above <code className="detail-code">{detail.normalText}</code>,
                      the value this check is healthy at.
                    </>
                  ) : detail.normalText ? (
                    <>
                      The reading no longer contains{' '}
                      <code className="detail-code">{detail.normalText}</code>, the phrase this
                      check is healthy on.
                    </>
                  ) : (
                    'The reading changed from the value this check is healthy on.'
                  )}
                </dd>
              </div>
            </>
          ) : (
            <div>
              <dt>Last {detail.runsInWindow ?? 0} runs</dt>
              <dd>
                All normal
                <span className="detail-sub"> · nothing flagged</span>
              </dd>
            </div>
          ))}
      </dl>

      {hasDetailTable && (
        <section className="detail-section">
          <h3 className="detail-subhead">
            {tableSpec.heading(detailRows.length)}
            {tile.key === 'unassignedRoles' && isRefreshing && (
              <span className="role-list-refreshing"> refreshing…</span>
            )}
          </h3>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="visually-hidden">{tableSpec.caption(sid)}</caption>
              <thead>
                <tr>
                  {tableSpec.columns.map((col) => (
                    <th key={col} scope="col">
                      {col}
                    </th>
                  ))}
                  {(tile.key === 'unassignedRoles' || tile.key === 'locked') && (
                    <th scope="col" className="detail-actions-col">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {detailRows.map((row, i) => (
                  // No id from SAP to key on — position is stable within one render.
                  // eslint-disable-next-line react/no-array-index-key
                  <tr key={i}>
                    {tableSpec.cells(row).map((cell, j) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <td key={j}>{cell}</td>
                    ))}
                    {tile.key === 'unassignedRoles' && (
                      <td className="detail-actions-col">
                        {deleteStatus[row.roleName] === 'done' ? (
                          <span className="role-delete-done">Deleted</span>
                        ) : deleteStatus[row.roleName] === 'error' ? (
                          <span className="role-delete-error">Failed</span>
                        ) : (
                          <button
                            type="button"
                            className="role-delete-btn"
                            disabled={deleteStatus[row.roleName] === 'pending'}
                            onClick={() => handleDeleteRole(row.roleName)}
                          >
                            {deleteStatus[row.roleName] === 'pending' ? '…' : 'Delete'}
                          </button>
                        )}
                      </td>
                    )}
                    {tile.key === 'locked' && (
                      <td className="detail-actions-col">
                        {deleteStatus[row.userName] === 'done' ? (
                          <span className="role-delete-done">Deleted</span>
                        ) : deleteStatus[row.userName] === 'error' ? (
                          <span className="role-delete-error">Failed</span>
                        ) : (
                          <button
                            type="button"
                            className="role-delete-btn"
                            disabled={deleteStatus[row.userName] === 'pending'}
                            onClick={() => setUserConfirm({ userName: row.userName })}
                          >
                            {deleteStatus[row.userName] === 'pending' ? '…' : 'Delete'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {deleteResponses.length > 0 && (
        <section className="detail-section">
          <h3 className="detail-subhead">Deletion responses</h3>
          <div className="delete-response-log">
            {deleteResponses.map((entry, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className={`delete-response-entry ${entry.success ? 'delete-response-ok' : 'delete-response-err'}`}>
                <span className="delete-response-role">{entry.roleName}</span>
                <span className="delete-response-time">{entry.at}{entry.status != null ? ` · HTTP ${entry.status}` : ''}</span>
                <pre className="delete-response-body">{entry.body}</pre>
              </div>
            ))}
          </div>
        </section>
      )}

      {readings.length > 0 && (
        <section className="detail-section">
          <h3 className="detail-subhead">Recent readings</h3>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="visually-hidden">
                {tile.label} readings for {sid}, newest first
              </caption>
              <thead>
                <tr>
                  <th scope="col">Run</th>
                  <th scope="col">Reading</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {readings.map((reading) => (
                  <tr key={reading.date}>
                    <td>{reading.dateShort}</td>
                    <td>{reading.value}</td>
                    <td>
                      <StatusDot
                        status={reading.isAnomaly ? 'warning' : 'ok'}
                        srLabel={reading.isAnomaly ? 'Flagged' : 'Normal'}
                      />
                      {reading.isAnomaly ? 'Flagged' : 'Normal'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="detail-note">
        {hasDetailTable
          ? 'This is the detail behind the reading above, captured at collection time.'
          : 'This dashboard records the summary line each check reports, not the underlying ' +
            'log.'}{' '}
        For the full detail, open <strong>{tile.label.split(' ')[0]}</strong> in {sid}.
      </p>

      {userConfirm && (
        <div className="user-delete-confirm-overlay" role="alertdialog" aria-modal="true" aria-labelledby="user-confirm-title">
          <div className="user-delete-confirm-box">
            <h4 className="user-delete-confirm-title" id="user-confirm-title">Confirm User Deletion</h4>
            <p className="user-delete-confirm-msg">
              Delete user <strong>{userConfirm.userName}</strong>? This action cannot be undone.
            </p>
            <div className="user-delete-confirm-actions">
              <button
                type="button"
                className="role-delete-btn"
                onClick={() => handleDeleteUser(userConfirm.userName)}
              >
                Yes, Delete
              </button>
              <button
                type="button"
                className="user-delete-cancel-btn"
                onClick={() => setUserConfirm(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
