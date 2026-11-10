'use client';

import { useMemo, useState } from 'react';

// Static user guide shown from the sidebar's "Help Centre" entry. Content is
// plain data so a section is added or reworded here without touching markup.
// Block types: p (paragraph), fields ([term, description] rows), steps
// (numbered list), list (bullets), note (callout).
const HELP_SECTIONS = [
  {
    id: 'overview',
    title: 'Overview',
    summary: 'What the SAP Monitoring Platform does and where its data comes from.',
    blocks: [
      { type: 'p', text: 'ApxOps replaces the manual daily Basis checklist. A background collector polls each SAP system on a schedule, stores every reading, flags anything that is no longer in its normal state, and presents the result as one consistent snapshot per system.' },
      { type: 'fields', rows: [
        ['Collection cycle', 'The collector runs on boot and then on the interval set in Admin Settings (default every 15 minutes). Each cycle writes one run per system.'],
        ['Daily snapshot', 'Dashboards always show the newest populated run of each calendar day, so a cycle that gathered nothing never blanks the screen.'],
        ['Anomaly', 'A check is flagged when its reading no longer contains that check’s expected "normal" text (for example SM13 must read "active"). Informational checks are never flagged.'],
        ['Auto-refresh', 'The open dashboard reloads itself on the configured refresh interval. Use Force Run to collect immediately.'],
      ] },
      { type: 'p', text: 'Monitored landscape: MSP (Production, Client 300), MSD (Client 100 and Client 150), MGP (BW / Analytics), SPA (Solution Manager), plus the BI Platform, Fiori Launchpad and Web Dispatcher endpoints.' },
    ],
  },
  {
    id: 'navigation',
    title: 'Navigation & layout',
    summary: 'Header, sidebar, scope bar, breadcrumb and view tabs.',
    blocks: [
      { type: 'fields', rows: [
        ['Header', 'Company logo, the application switcher (Landscape Health / Batch Job Monitor, when enabled) and your user menu.'],
        ['User menu', 'Shows your name and role. Lead Administrators see Admin Settings here. Sign Out ends the session.'],
        ['Sidebar — SAP Systems', 'Lists the systems assigned to you. Click a system to load its dashboard. Systems with several clients (e.g. MSD) appear as an expandable group.'],
        ['Alert badge', 'The number beside each system is its open-alert count: green 0 = healthy, red = alerts to review.'],
        ['Collapse toggle', 'The blue arrow at the top of the sidebar shrinks it to icons to give the dashboard more room.'],
        ['Breadcrumb', 'Shows which system and client you are looking at.'],
        ['View tabs', 'Basis Monitoring, System Monitoring, IDoc Monitoring (MSD only), Batch Monitoring, History log and Reporting.'],
        ['Tile / List View', 'Switch between the card grid and a sortable table of the same metrics.'],
      ] },
      { type: 'note', text: 'On phones and narrow screens the sidebar becomes a system drop-down at the top of the page.' },
    ],
  },
  {
    id: 'scope-bar',
    title: 'Scope bar & filters',
    summary: 'Priority filter, historical dates, Force Run and the alerts bell.',
    blocks: [
      { type: 'fields', rows: [
        ['Priority Filter', 'Show All Priorities, only Critical, Warning / Serious, or Healthy (Green) metrics.'],
        ['View Date', 'Pick an earlier day to see that day’s snapshot. "Latest" returns to live data.'],
        ['Latest run / Viewing', 'The run the screen is built from. A Historical badge appears when you are looking at a past date.'],
        ['Back to Live', 'Leaves historical mode and reloads the latest data.'],
        ['⚡ Force Run', 'Triggers a collection cycle on the server straight away, then refreshes the dashboard. Only available in live mode.'],
        ['Alerts bell', 'Lists active and recently resolved alerts for the selected system. Click an alert to open the metric’s detail.'],
      ] },
    ],
  },
  {
    id: 'status',
    title: 'Status, alerts & health score',
    summary: 'How to read colours, glyphs and the system score.',
    blocks: [
      { type: 'p', text: 'Status is always shown as colour, symbol and text together, so it can be read without relying on colour alone.' },
      { type: 'fields', rows: [
        ['Normal / Healthy', 'Reading matches its expected value.'],
        ['Warning / Serious', 'Reading has drifted from normal and should be reviewed.'],
        ['Critical', 'A hard failure. ST22 dumps, SM51 servers not active, a stalled SM13 update queue, SM50 work processes over threshold and expired STRUST certificates are always critical.'],
        ['Informational', 'Reference value only (volumes, free memory, SM12 locks, SM58 tRFC). Never raises an alert.'],
        ['Health score', 'Starts at 100, minus 8 for each active alert and 2 for each anomaly in the recent window. It never drops below 50.'],
      ] },
    ],
  },
  {
    id: 'basis',
    title: 'Basis Monitoring',
    summary: 'Technical health of the selected SAP system.',
    blocks: [
      { type: 'p', text: 'The default tab. It shows endpoint reachability, storage volumes and the SAP technical checks for the latest run, followed by trend charts.' },
      { type: 'fields', rows: [
        ['Endpoint Availability', 'Whether BI Platform, Fiori Launchpad and Web Dispatcher URLs are reachable.'],
        ['DBA Cockpit — Data / Log Volume', 'Used vs. total database space. Not every run restates volumes, so the last known value is carried forward and marked as such.'],
        ['Free Memory — App Server / Database', 'Available memory shown as a donut.'],
        ['ST22 — ABAP Runtime Errors', 'Count of short dumps. Normal = 0.'],
        ['Backup', 'Result of the latest database backup. Normal = "backup successful".'],
        ['SM13 — Update Requests', 'Update service state. Normal = "active".'],
        ['SM12 — Lock Entries', 'Current lock entries (informational).'],
        ['SM51 — Application Servers', 'Application server status. Normal = "active".'],
        ['SM50 — Work Process List', 'Work process health. Normal = "all ok".'],
        ['ST06 — OS Monitoring', 'CPU, memory and swap of the host. Normal = "all ok".'],
        ['SM37 — Background Jobs', 'Long-running jobs. Normal = "no long running".'],
        ['Cancelled Jobs', 'Jobs cancelled since the last run. Normal = "no cancelled jobs".'],
        ['SMQ1 / SMQ2 — Outbound / Inbound Queues', 'qRFC queues. Normal = "no queues found".'],
        ['SM20 — Security Audit Log', 'Critical user activity. Normal = "no user critical activity".'],
        ['SM21 — System Log', 'High-priority system log entries. Normal = "no high priority entry found".'],
        ['SM58 — Transactional RFC', 'tRFC entries (informational).'],
        ['STRUST — SSL Certificates', 'Certificates already expired, expiring today and expiring within 15 days. Normal = 0.'],
      ] },
      { type: 'list', items: [
        'Favorites: drag any tile into the Favorites area (or use its star) to pin it to the top. Favorites are remembered in your browser.',
        'Trends: charts below the tiles show how volumes and checks moved over recent days. Each chart has a "View data table" option.',
      ] },
    ],
  },
  {
    id: 'detail',
    title: 'Metric detail dialog',
    summary: 'What opens when you click a tile or a list row.',
    blocks: [
      { type: 'fields', rows: [
        ['Reading', 'The current value exactly as SAP reported it.'],
        ['State', 'Normal, Warning, Critical or Informational.'],
        ['Why it is flagged', 'Plain-language explanation of what differs from the expected value.'],
        ['Flagged since', 'The first run in the current unbroken streak of anomalies.'],
        ['Recent readings', 'The latest readings for this check, run by run.'],
        ['Detail table', 'Row-level data from SAP (e.g. the users, roles or servers behind the count) when the check provides it.'],
        ['Actions', 'Clean-up buttons on supported checks — see System Monitoring.'],
      ] },
    ],
  },
  {
    id: 'system',
    title: 'System Monitoring',
    summary: 'User access and security compliance checks.',
    blocks: [
      { type: 'p', text: 'Ten user-management and authorisation checks. For every check a value of 0 is healthy.' },
      { type: 'fields', rows: [
        ['Locked Users', 'User accounts currently locked.'],
        ['Inactive Users', 'Accounts that have not logged on for a long period.'],
        ['High Privilege Users', 'Users holding powerful profiles such as SAP_ALL.'],
        ['Unassigned Roles', 'Roles that exist but are assigned to nobody.'],
        ['Unused Roles (Ghost)', 'Roles assigned but never used.'],
        ['Unused Profiles', 'Authorisation profiles no longer in use.'],
        ['Unused T-Codes', 'Transactions granted but never executed.'],
        ['Undeleted Users', 'Leavers whose accounts still exist.'],
        ['Redundant Roles', 'Roles that duplicate access already granted elsewhere.'],
        ['Empty Shell Users', 'Users with no roles or profiles assigned.'],
      ] },
      { type: 'note', text: 'Clean-up actions: in the detail dialog of Locked Users and Unassigned Roles each row has a Delete button. User deletion asks for confirmation first. Deletions are executed in SAP and cannot be undone — every response is listed under "Deletion responses".' },
    ],
  },
  {
    id: 'idoc',
    title: 'IDoc Monitoring',
    summary: 'Inbound and outbound IDoc processing (MSD Client 100 and 150).',
    blocks: [
      { type: 'fields', rows: [
        ['Inbound / Outbound IDoc Errors', 'IDocs ending in error. 0 = Normal, any value = Critical. Investigate in WE05.'],
        ['Stuck Inbound / Outbound IDocs', 'IDocs waiting without progressing. 0 = Normal, any value = Critical.'],
        ['Inbound / Outbound Success Rate', 'Percentage processed successfully: 95% or more Normal, 80–94% Warning, below 80% Critical.'],
        ['Inbound / Outbound IDoc Volume', 'Number of IDocs processed (informational).'],
        ['Total IDoc activity', 'Combined inbound and outbound count (informational).'],
        ['Average Latency', 'Average processing time in seconds, inbound and outbound (informational).'],
      ] },
      { type: 'p', text: 'Click a tile to see the individual IDocs behind the number.' },
    ],
  },
  {
    id: 'batch',
    title: 'Batch Monitoring',
    summary: 'AI-assisted investigation of failed background jobs.',
    blocks: [
      { type: 'steps', items: [
        'Choose a Run date and click Fetch Jobs to load that day’s SAP batch jobs.',
        'An investigation starts automatically and its progress is shown live: fetch jobs → analyse logs → match known issues → identify recurring errors → recommend actions → summarise.',
        'Click a job to open its drill-down.',
        'Review the Incident Summary, Recurring Error Patterns and Recommended Corrective Actions.',
        'Use Create ServiceNow Ticket or Notify Team on a job to hand it over.',
      ] },
      { type: 'fields', rows: [
        ['Job list', 'Job name, program, T-code, status and error.'],
        ['Drill-down', 'Program, T-code, start / end time, error code, AI analysis, matched known issues, retrieved documentation and the raw job log.'],
      ] },
    ],
  },
  {
    id: 'history',
    title: 'History log',
    summary: 'Day-by-day outcome for the selected system.',
    blocks: [
      { type: 'p', text: 'One row per run date. Clean days show a single "Normal" note; days with anomalies list each flagged check with the value it reported.' },
    ],
  },
  {
    id: 'reporting',
    title: 'Reporting',
    summary: 'Downloadable reports over a date range.',
    blocks: [
      { type: 'steps', items: [
        'Pick a range with Today, Last 7 days, Last 30 days, or set From / To dates.',
        'Select the tiles to include (or keep All tiles).',
        'Choose a format and click Generate Report.',
      ] },
      { type: 'fields', rows: [
        ['Excel (.xlsx)', 'Four-sheet workbook: summary, observations, anomalies and a daily pivot.'],
        ['PDF (Print)', 'Opens a print-ready report in a new tab; save it as PDF from the browser.'],
      ] },
    ],
  },
  {
    id: 'export',
    title: 'Export & email',
    summary: 'One-click export of the snapshot on screen.',
    blocks: [
      { type: 'fields', rows: [
        ['Excel', 'Downloads the current snapshot — checks, alerts and endpoints — as a workbook.'],
        ['PDF', 'Opens a printable report with the health score, system checks, alerts and endpoints.'],
        ['Email', 'Sends the current snapshot to your signed-in email address.'],
      ] },
    ],
  },
  {
    id: 'assistant',
    title: 'APxOps Assistant',
    summary: 'AI chat about the dashboard you are viewing.',
    blocks: [
      { type: 'p', text: 'Open the chat button at the bottom-right of the screen and ask questions in plain language, e.g. "Which certificates expire soon?" or "Why is the health score low?". The assistant answers from the snapshot currently on screen.' },
    ],
  },
  {
    id: 'admin',
    title: 'Admin Settings',
    summary: 'Lead Administrator only — open from the user menu.',
    blocks: [
      { type: 'fields', rows: [
        ['User Management', 'Add, edit or delete users; set their role (Lead Administrator or Basis Operator), assigned systems and plan.'],
        ['Plan & Tile Configuration', 'Choose which tiles each plan (Basis Monitoring, System Monitoring) can see. Users only see tiles enabled in their plan.'],
        ['Dashboard Refresh', 'How often open dashboards reload and how often the collector polls SAP.'],
        ['Email Notification Settings', 'SMTP server details and the Daily Email Digest (send time and time zone) sent to all users.'],
        ['Company Settings', 'Upload the logo shown in the header.'],
      ] },
    ],
  },
  {
    id: 'faq',
    title: 'FAQ & troubleshooting',
    summary: 'Common questions.',
    blocks: [
      { type: 'fields', rows: [
        ['"No monitoring data yet"', 'The system’s SAP endpoints are not configured or have not returned data. Ask an administrator to check the collector.'],
        ['A tile is missing', 'Your plan may not include it, or the system has no reading for it. Ask a Lead Administrator.'],
        ['A system is missing from the sidebar', 'It is not in your assigned systems.'],
        ['IDoc tab not visible', 'IDoc Monitoring is only available for MSD Client 100 and Client 150.'],
        ['Numbers look old', 'Check whether a Historical date is selected; click Back to Live or Force Run.'],
      ] },
    ],
  },
];

function blockText(block) {
  if (block.text) return block.text;
  if (block.items) return block.items.join(' ');
  if (block.rows) return block.rows.flat().join(' ');
  return '';
}

function HelpBlock({ block }) {
  switch (block.type) {
    case 'fields':
      return (
        <dl className="help-fields">
          {block.rows.map(([term, desc]) => (
            <div className="help-field" key={term}>
              <dt>{term}</dt>
              <dd>{desc}</dd>
            </div>
          ))}
        </dl>
      );
    case 'steps':
      return <ol className="help-steps">{block.items.map((t) => <li key={t}>{t}</li>)}</ol>;
    case 'list':
      return <ul className="help-list">{block.items.map((t) => <li key={t}>{t}</li>)}</ul>;
    case 'note':
      return <p className="help-note"><strong>Note:</strong> {block.text}</p>;
    default:
      return <p className="help-p">{block.text}</p>;
  }
}

export function HelpCentre() {
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return HELP_SECTIONS;
    return HELP_SECTIONS.filter((s) =>
      [s.title, s.summary, ...s.blocks.map(blockText)].join(' ').toLowerCase().includes(q)
    );
  }, [query]);

  const jumpTo = (id) => {
    document.getElementById(`help-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="help-centre" aria-labelledby="help-centre-title">
      <div className="help-hero card">
        <div>
          <h2 id="help-centre-title" className="help-title">Help Centre</h2>
          <p className="help-subtitle">
            How each section, field and report of the SAP Monitoring Platform works.
          </p>
        </div>
        <input
          type="search"
          className="help-search"
          placeholder="Search help (e.g. STRUST, Force Run, report)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search help topics"
        />
      </div>

      <div className="help-layout">
        <nav className="help-toc card" aria-label="Help topics">
          <div className="help-toc-title">Topics</div>
          {sections.map((s) => (
            <button key={s.id} type="button" className="help-toc-item" onClick={() => jumpTo(s.id)}>
              {s.title}
            </button>
          ))}
        </nav>

        <div className="help-content">
          {sections.length === 0 ? (
            <div className="card state-panel">No help topics match &ldquo;{query}&rdquo;.</div>
          ) : (
            sections.map((s) => (
              <article key={s.id} id={`help-${s.id}`} className="help-section card">
                <h3 className="help-section-title">{s.title}</h3>
                <p className="help-section-summary">{s.summary}</p>
                {s.blocks.map((b, i) => (
                  // Blocks are static and never reorder — index is a stable key.
                  // eslint-disable-next-line react/no-array-index-key
                  <HelpBlock key={i} block={b} />
                ))}
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
