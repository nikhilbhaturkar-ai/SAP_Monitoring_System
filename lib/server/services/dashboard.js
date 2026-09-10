import * as repo from '../repositories/monitoring.js';
import { volumeInfo, formatDate, formatDateShort, round2 } from '../lib/metrics.js';
import { config } from '../config.js';

const VOLUME_KEYS = ['dataVol', 'logVol', 'freeApp', 'freeDb'];
// Volumes and memory get their own cards, so they are excluded from the checks grid.
const CHECKS_GRID_EXCLUDES = new Set(VOLUME_KEYS);

/**
 * Health score mirrors the checklist the Basis team already uses: start at 100
 * and deduct per anomaly observed in the window, floored so a noisy window still
 * reads as "degraded" rather than "failed".
 */
function healthScore(windowAnomalies = 0, activeAlerts = 0) {
  const score = 100 - activeAlerts * 8 - windowAnomalies * 2;
  return Math.max(50, Math.min(100, score));
}

// Checks whose flagged state is always a hard failure, not a word the raw
// value happens to contain — st22 is a bare count now (no "fail" / "error"
// text for the regex below to match), sm51 NOT-Active and a stalled sm13
// update queue are both "the system stopped doing its job", not a soft
// warning either, and sm50's WP_GT_THRESHOLD > 0 (work processes stuck
// running past 100000s) is the same kind of hard failure. sm12 is
// informational (is_info in seed.sql), so it never reaches severityOf() —
// kept out of this set rather than left as dead coverage.
// strust: an already-expired SSL certificate is a hard failure, not a soft
// warning — same reasoning as the rest of this set.
const ALWAYS_CRITICAL_CHECKS = new Set(['st22', 'sm51', 'sm13', 'sm50', 'strust']);

// Checks whose detail dialog is worth opening even when nothing is wrong —
// reference information about the check, not evidence of a failure. sm51's
// server list is "what app servers make up this system", exactly as useful
// to see on a healthy Active reading as on a NOT-Active one. sm12's lock
// table is the same idea: a handful of active locks is normal SAP operation,
// worth seeing on demand rather than only once something is wrong. sm50 is
// the same again — the full work-process list is useful to inspect on
// demand, not just once WP_GT_THRESHOLD flags something. st06's three-way
// Memory/Swap/CPU breakdown (see osStatusOf below) is exactly the same case
// as sm51 — "which of the three passed" is worth a click on a healthy
// reading, not just a flagged one. backup is the same again: its icon
// replaces the pass/fail sentence entirely, so the log behind it has to be
// reachable by clicking regardless of whether the latest run passed. sm58 is
// is_info with no normal_text (its count never anomalies), so without this
// it would never be openable at all — the pending tRFC list behind its
// count is worth a click on demand, the same as sm50's worker list.
const ALWAYS_OPENABLE_CHECKS = new Set(['sm51', 'sm12', 'st06', 'backup', 'sm50', 'sm58']);

function severityOf(rawValue, checkKey) {
  if (ALWAYS_CRITICAL_CHECKS.has(checkKey)) return 'critical';
  return /fail|down|error|unreachable/i.test(rawValue || '') ? 'critical' : 'warning';
}

// mappers.js's st06 case formats the reading as
// "All OK - Mem: Memory Ok!, Swap: Swap Ok!, CPU: CPU Ok!" when healthy, or
// "Mem: X, Swap: Y, CPU: Z" (no "All OK -" prefix) the moment any one of the
// three isn't — same three labels either way, so they're pulled back out
// here for the tile's checkbox row rather than re-parsed on the client.
const OS_STATUS_RE = /Mem:\s*([^,]+),\s*Swap:\s*([^,]+),\s*CPU:\s*(.+)$/i;

function osStatusOf(rawValue) {
  const match = OS_STATUS_RE.exec(rawValue || '');
  if (!match) return null;
  const [, mem, swap, cpu] = match;
  const subChecks = [
    { key: 'mem', label: 'Memory', ok: /ok/i.test(mem) },
    { key: 'swap', label: 'Swap', ok: /ok/i.test(swap) },
    { key: 'cpu', label: 'CPU', ok: /ok/i.test(cpu) },
  ];
  return { allOk: subChecks.every((c) => c.ok), subChecks };
}

export async function buildDashboard(sid, windowDays = 20) {
  const systems = await repo.listSystems();
  const system = systems.find((s) => s.sid === sid && s.kind === 'sap');
  if (!system) {
    const err = new Error(`unknown SAP system "${sid}"`);
    err.status = 404;
    throw err;
  }

  // The authoritative "is this system's live SAP API even configured" signal
  // — not whether any observation happens to say source='sap-api', because a
  // stray or historical live row must not make an otherwise-unconfigured
  // system look connected. See config.sap.baseUrls / .env SAP_BASE_URL_<SID>.
  const hasLiveApi = Boolean(config.sap.baseUrls[sid]);

  // Per-system, not landscape-wide: a system still on Excel-only history must
  // anchor to its own newest run, not to today just because some other system
  // (MSD) now polls a live API on today's date. See
  // getLatestRunDateForSystem's own comment for how this broke silently.
  const latestDate = await repo.getLatestRunDateForSystem(sid);
  if (!latestDate) {
    const err = new Error(
      `no monitoring runs for "${sid}" — run 'npm run import' or check its SAP API config`
    );
    err.status = 503;
    throw err;
  }

  const [observations, checksSnapshot, volumeRows, anomalyRows, urlRows, landscape] =
    await Promise.all([
      repo.getSystemObservations(sid, windowDays),
      repo.getLatestChecksSnapshot(sid, windowDays),
      repo.getVolumeSeries(sid, VOLUME_KEYS, windowDays),
      repo.getAnomalies(sid, windowDays),
      repo.getUrlStatuses(),
      repo.getLandscapeSummary(windowDays),
    ]);

  const latestLabel = formatDate(latestDate);

  // The checks grid reads each check's own latest reading (checksSnapshot),
  // not just whatever the grid's single latest run happened to catch — see
  // getLatestChecksSnapshot for why. `observations` (day-collapsed, via
  // daily_runs) stays the source for trends and per-check reading history
  // below, where the one-row-per-day shape is correct.
  const byKey = new Map(checksSnapshot.map((o) => [o.check_key, o]));
  const latestObs = checksSnapshot;

  // Detail rows are the evidence for a flagged check, so for st22/sm12
  // they're only fetched when the check is actually anomalous on the latest
  // run — a healthy run has nothing to show, and the query is skipped rather
  // than run and discarded.
  //
  // sm51 and backup are the exceptions: sm51's server list is reference
  // information ("what app servers make up this system"), not failure
  // evidence, and backup's log is exactly what the icon's click-through is
  // for — the recent run history behind the pass/fail icon, not just proof
  // of a failure — so both are fetched whenever the check has a reading at
  // all, healthy or not.
  //
  // Rows are mapped into the same field names detailFor() exposes on the API,
  // right where they're fetched, rather than threading raw column names
  // further into the function below.
  const [
    st22Dumps,
    backupLog,
    locks,
    servers,
    workers,
    jobs,
    cancelledJobs,
    certs,
    certsToday,
    certs15d,
    smq1Errors,
    smq2Errors,
    auditFiles,
    syslogEntries,
    trfcs,
  ] = await Promise.all([
    byKey.get('st22')?.is_anomaly
      ? repo.getLatestSt22Dumps(sid).then((rows) =>
          rows.map((d) => ({
            date: d.dump_date,
            time: d.dump_time,
            host: d.host,
            user: d.sap_user,
            dumpId: d.dump_id,
            program: d.program_name,
            include: d.include_name,
            line: d.line_number,
          }))
        )
      : [],
    byKey.has('backup')
      ? repo.getLatestBackupLog(sid).then((rows) =>
          rows.map((b) => ({
            type: b.entry_type,
            start: b.entry_start,
            end: b.entry_end,
            state: b.entry_state,
            comment: b.entry_comment,
          }))
        )
      : [],
    byKey.has('sm12')
      ? repo.getLatestLocks(sid).then((rows) =>
          rows.map((l) => ({
            user: l.lock_user,
            table: l.table_name,
            mode: l.lock_mode,
            time: l.lock_time,
            durationHrs: l.duration_hrs,
          }))
        )
      : [],
    byKey.has('sm51')
      ? repo.getLatestServers(sid).then((rows) =>
          rows.map((s) => ({
            name: s.server_name,
            host: s.host,
            hostLong: s.host_long,
            hostAddr: s.host_addr,
          }))
        )
      : [],
    byKey.has('sm50')
      ? repo.getLatestWorkers(sid).then((rows) =>
          rows.map((w) => ({
            index: w.wp_index,
            type: w.wp_type,
            status: w.wp_status,
            info: w.wp_info,
            server: w.server_name,
            user: w.wp_user,
            program: w.wp_program,
            cpu: w.wp_cpu,
            pid: w.wp_pid,
            waitPriority: w.wait_priority,
          }))
        )
      : [],
    byKey.get('sm37')?.is_anomaly
      ? repo.getLatestJobs(sid).then((rows) =>
          rows.map((j) => ({
            jobName: j.job_name,
            schedDate: j.sched_date,
            schedTime: j.sched_time,
          }))
        )
      : [],
    byKey.get('cancel')?.is_anomaly
      ? repo.getLatestCancelJobs(sid).then((rows) =>
          rows.map((c) => ({
            jobName: c.job_name,
            schedDate: c.sched_date,
            schedTime: c.sched_time,
            userName: c.user_name,
            status: c.status,
            jobLog: c.job_log,
            wpProcess: c.wp_process,
            btcsysreax: c.btcsysreax,
            reaxserver: c.reaxserver,
          }))
        )
      : [],
    byKey.get('strust')?.is_anomaly
      ? repo.getLatestCerts(sid, 'strust').then((rows) =>
          rows.map((c) => ({
            result: c.cert_result,
            certificate: c.certificate,
            validFrom: c.valid_from,
            validTo: c.valid_to,
          }))
        )
      : [],
    byKey.get('strustToday')?.is_anomaly
      ? repo.getLatestCerts(sid, 'strustToday').then((rows) =>
          rows.map((c) => ({
            result: c.cert_result,
            certificate: c.certificate,
            validFrom: c.valid_from,
            validTo: c.valid_to,
          }))
        )
      : [],
    byKey.get('strust15d')?.is_anomaly
      ? repo.getLatestCerts(sid, 'strust15d').then((rows) =>
          rows.map((c) => ({
            result: c.cert_result,
            certificate: c.certificate,
            validFrom: c.valid_from,
            validTo: c.valid_to,
          }))
        )
      : [],
    byKey.get('smq1')?.is_anomaly
      ? repo.getLatestQueueErrors(sid, 'smq1').then((rows) =>
          rows.map((q) => ({
            arfcipid: q.arfcipid,
            arfcpid: q.arfcpid,
            queueName: q.queue_name,
            rfcFunction: q.rfc_function,
            rfcDate: q.rfc_date,
            errorMessage: q.error_message,
          }))
        )
      : [],
    byKey.get('smq2')?.is_anomaly
      ? repo.getLatestQueueErrors(sid, 'smq2').then((rows) =>
          rows.map((q) => ({
            arfcipid: q.arfcipid,
            arfcpid: q.arfcpid,
            queueName: q.queue_name,
            rfcFunction: q.rfc_function,
            rfcDate: q.rfc_date,
            errorMessage: q.error_message,
          }))
        )
      : [],
    byKey.get('sm20')?.is_anomaly
      ? repo.getLatestAuditFiles(sid).then((rows) =>
          rows.map((a) => ({
            instanceName: a.instance_name,
            fileName: a.file_name,
            outputText: a.output_text,
          }))
        )
      : [],
    byKey.get('sm21')?.is_anomaly
      ? repo.getLatestSyslogEntries(sid).then((rows) =>
          rows.map((l) => ({
            logDate: l.log_date,
            logTime: l.log_time,
            instanceName: l.instance_name,
            priorityIcon: l.priority_icon,
            messageText: l.message_text,
            slgData: l.slg_data,
          }))
        )
      : [],
    byKey.has('sm58')
      ? repo.getLatestTrfcs(sid).then((rows) =>
          rows.map((t) => ({
            arfcipid: t.arfcipid,
            arfcdest: t.arfcdest,
            arfcfnam: t.arfcfnam,
            arfctcode: t.arfctcode,
            arfcrhost: t.arfcrhost,
            arfcmsg: t.arfcmsg,
            arfcreserv: t.arfcreserv,
            hash: t.trfc_hash,
          }))
        )
      : [],
    ]);
  const detailRowsByKey = {
    st22: st22Dumps,
    backup: backupLog,
    sm12: locks,
    sm51: servers,
    sm50: workers,
    sm37: jobs,
    cancel: cancelledJobs,
    strust: certs,
    strustToday: certsToday,
    strust15d: certs15d,
    smq1: smq1Errors,
    smq2: smq2Errors,
    sm20: auditFiles,
    sm21: syslogEntries,
    sm58: trfcs,
  };

  // ── Alerts ────────────────────────────────────────────────────────────────
  const alerts = anomalyRows.map((row) => ({
    checkKey: row.check_key,
    date: row.run_date,
    dateShort: formatDateShort(row.run_date),
    label: row.check_label,
    value: row.raw_value,
    severity: severityOf(row.raw_value, row.check_key),
    isActive: row.run_date === latestDate,
  }));
  const activeAlerts = alerts.filter((a) => a.isActive);
  const recentResolved = alerts.filter((a) => !a.isActive).slice(0, 4);

  // ── Volume + memory cards, with their day-wise trends ─────────────────────
  const seriesByKey = new Map(VOLUME_KEYS.map((k) => [k, []]));
  for (const row of volumeRows) {
    seriesByKey.get(row.check_key)?.push({
      date: row.run_date,
      dateShort: formatDateShort(row.run_date),
      source: row.source,
      usedGB: row.used_gb,
      freeGB: row.free_gb,
      totalGB: row.total_gb,
      carriedForward: row.carried_forward,
    });
  }

  const metrics = {};
  for (const key of VOLUME_KEYS) {
    const latest = byKey.get(key);
    const filled = seriesByKey.get(key) ?? [];
    const latestFilled = filled[filled.length - 1];
    // The source of whichever reading actually filled this tile — the live
    // run if it has a value, else the carried-forward point behind it.
    const source = latest?.source ?? latestFilled?.source ?? null;

    metrics[key] = {
      ...volumeInfo(
        {
          raw: latest?.raw_value ?? latestFilled?.raw_value ?? null,
          used_gb: latest?.used_gb ?? latestFilled?.usedGB ?? null,
          total_gb: latest?.total_gb ?? latestFilled?.totalGB ?? null,
          free_gb: latest?.free_gb ?? latestFilled?.freeGB ?? null,
        },
        latestLabel
      ),
      key,
      label: latest?.check_label ?? key,
      series: filled,
      source,
      // hasLiveApi is system-wide (from config), not per-reading — a system
      // with no base URL configured can only ever show imported data, no
      // matter what an individual observation's source says.
      hasLiveApi,
    };
  }

  // ── Checks grid (everything that is not a volume card) ────────────────────

  /**
   * Everything known about one check, for the tile's detail dialog.
   *
   * Normally only anomalies carry it: the readings are already in
   * `observations` for the whole window, so this costs no extra query, but
   * attaching the trail to all ~14 checks would multiply the payload for
   * panels nobody can open. ALWAYS_OPENABLE_CHECKS (sm51) is the deliberate
   * exception — its dialog is reference information, not failure evidence.
   *
   * Row-level detail (dump program, lock owner, server host, backup log
   * entry, …) is included only for the four checks in detailRowsByKey, and
   * only because their own tables actually hold them — every other check
   * still has no such detail, so the dialog keeps pointing at the real
   * transaction for those rather than inventing fields.
   */
  function detailFor(observation) {
    const readings = observations
      .filter((o) => o.check_key === observation.check_key)
      .map((o) => ({
        date: o.run_date,
        dateShort: formatDateShort(o.run_date),
        value: o.raw_value ?? '—',
        isAnomaly: o.is_anomaly,
      }));

    // How long it has been failing: walk back from the latest run until a
    // healthy reading breaks the streak. Stays 0 for a check that isn't
    // currently flagged, which is correct — nothing to report as "since".
    let streak = 0;
    for (const reading of readings) {
      if (!reading.isAnomaly) break;
      streak += 1;
    }

    return {
      isAnomaly: observation.is_anomaly,
      normalText: observation.normal_text,
      firstSeen: readings[streak - 1]?.date ?? observation.run_date,
      firstSeenShort: readings[streak - 1]?.dateShort ?? formatDateShort(observation.run_date),
      consecutiveRuns: streak,
      occurrencesInWindow: readings.filter((r) => r.isAnomaly).length,
      runsInWindow: readings.length,
      readings: readings.slice(0, 10),
      detailRows: detailRowsByKey[observation.check_key] ?? null,
    };
  }

  const params = latestObs
    .filter((o) => !CHECKS_GRID_EXCLUDES.has(o.check_key) && o.check_key !== 'urlStatus')
    .sort((a, b) => a.check_order - b.check_order)
    .map((o) => ({
      key: o.check_key,
      label: o.check_label,
      value: o.raw_value ?? '—',
      status: o.is_anomaly
        ? severityOf(o.raw_value, o.check_key)
        : o.is_info && !ALWAYS_OPENABLE_CHECKS.has(o.check_key)
          ? 'info'
          : 'ok',
      severity: o.is_anomaly ? severityOf(o.raw_value, o.check_key) : null,
      detail: o.is_anomaly || ALWAYS_OPENABLE_CHECKS.has(o.check_key) ? detailFor(o) : null,
      source: o.source,
      hasLiveApi,
      // Set when this check's poll failed on the latest run and the tile is
      // showing its last successful reading instead — see the byKey gap-fill
      // above.
      carriedForwardNote:
        o.run_date !== latestDate ? `Latest successful reading — ${formatDateShort(o.run_date)}` : null,
      osStatus: null,
      // Backup, Work Process List (SM50) and OS Monitoring (ST06) are all
      // pass/fail, not a value worth reading as text — the tile shows a
      // success/failure icon in place of the reading sentence. is_anomaly is
      // already the true/false each check reduces to, so it's reused rather
      // than re-testing raw_value here too.
      statusIcon:
        o.check_key === 'backup' || o.check_key === 'sm50' || o.check_key === 'st06'
          ? { ok: !o.is_anomaly }
          : null,
    }));

  const score = healthScore(alerts.length, activeAlerts.length);

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    latestRun: { date: latestDate, label: latestLabel },
    selectedSid: sid,
    systems: systems
      .filter((s) => s.kind === 'sap')
      .map((s) => ({ sid: s.sid, name: s.name })),
    systemCard: {
      sid: system.sid,
      name: system.name,
      score,
      status: activeAlerts.length > 0 ? 'warning' : 'healthy',
      statusLabel:
        activeAlerts.length > 0
          ? `${activeAlerts.length} issue${activeAlerts.length > 1 ? 's' : ''} today`
          : 'Healthy',
      hasLiveApi,
      dataVol: metrics.dataVol,
      logVol: metrics.logVol,
      freeApp: metrics.freeApp,
      freeDb: metrics.freeDb,
      params,
    },
    alerts: {
      active: activeAlerts,
      recentResolved,
      totalInWindow: alerts.length,
    },
    endpoints: urlRows.map((row) => {
      const ok = /accessable|accessible/i.test(row.raw_value || '');
      return {
        sid: row.sid,
        name: row.name,
        host: row.host,
        url: row.url,
        status: ok ? 'Reachable' : 'Unreachable',
        reachable: ok,
      };
    }),
    trends: {
      // "Free" series read as headroom; the cards above show consumption.
      freeApp: (seriesByKey.get('freeApp') ?? []).map((p) => ({
        date: p.date,
        dateShort: p.dateShort,
        value: p.freeGB,
      })),
      freeDb: (seriesByKey.get('freeDb') ?? []).map((p) => ({
        date: p.date,
        dateShort: p.dateShort,
        value: p.freeGB,
      })),
    },
    landscape: landscape.map((row) => ({
      sid: row.sid,
      name: row.name,
      openAlerts: Number(row.open_alerts),
      windowAlerts: Number(row.window_alerts),
      score: healthScore(Number(row.window_alerts), Number(row.open_alerts)),
    })),
  };
}

export async function buildHistory(sid, limit = 60) {
  const rows = await repo.getSystemHistory(sid, limit);
  return rows.map((row) => {
    const count = Number(row.anomaly_count);
    return {
      date: row.run_date,
      dateLabel: formatDate(row.run_date),
      dateShort: formatDateShort(row.run_date),
      status: count === 0 ? 'ok' : 'warning',
      note:
        count === 0
          ? 'Normal'
          : row.anomaly_labels.map((label, i) => `${label}: ${row.anomaly_values[i]}`).join('; '),
      anomalies: row.anomaly_labels.map((label, i) => ({
        label,
        value: row.anomaly_values[i],
      })),
    };
  });
}

export async function buildTrend(sid, checkKey, windowDays = 30) {
  const rows = await repo.getVolumeSeries(sid, [checkKey], windowDays);
  return rows.map((row) => ({
    date: row.run_date,
    dateShort: formatDateShort(row.run_date),
    usedGB: row.used_gb,
    freeGB: row.free_gb,
    totalGB: row.total_gb,
    percentUsed:
      row.used_gb != null && row.total_gb ? round2((row.used_gb / row.total_gb) * 100) : null,
    carriedForward: row.carried_forward,
  }));
}
