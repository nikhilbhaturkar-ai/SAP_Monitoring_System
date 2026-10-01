import { describe, it, expect } from 'vitest';
import {
  toRawValue,
  toDumpDetails,
  toBackupLogDetails,
  toLockDetails,
  toJobDetails,
  toCancelJobDetails,
  toCertDetails,
  toQueueErrorDetails,
  toAuditFileDetails,
  toSyslogDetails,
  toTrfcDetails,
  toServerDetails,
  toWorkerDetails,
  toLockedUserDetails,
  toInactiveUserDetails,
  toHighPrivUserDetails,
  toUnassignedRoleDetails,
  toGhostRoleDetails,
  toUnusedProfileDetails,
  toUnusedTcodeDetails,
  toUndeletedUserDetails,
  toRedundantRoleDetails,
  toEmptyShellDetails,
} from '../lib/server/sap/mappers.js';

// ── toRawValue ─────────────────────────────────────────────────────────────────

describe('toRawValue — unknown check key', () => {
  it('returns null for unknown check keys', () => {
    expect(toRawValue('unknownKey', {})).toBeNull();
  });
});

describe('toRawValue — dataVol', () => {
  it('returns used/total GB string', () => {
    expect(toRawValue('dataVol', { USED_GB: 224.75, LIMIT_GB: 500 })).toBe('224.75 GB /500 GB');
  });
  it('returns null for non-finite values', () => {
    expect(toRawValue('dataVol', { USED_GB: 'x', LIMIT_GB: 500 })).toBeNull();
    expect(toRawValue('dataVol', null)).toBeNull();
  });
});

describe('toRawValue — logVol', () => {
  const payload = [
    { METRIC_NAME: 'Total Host Disk Size (Log Path)', SIZE_GB: 200 },
    { METRIC_NAME: 'Free Host Disk Space (Log Path)', SIZE_GB: 80 },
  ];
  it('returns Total/Free GB string', () => {
    expect(toRawValue('logVol', payload)).toBe('Total: 200 GB / Free: 80 GB');
  });
  it('returns null for missing metrics', () => {
    expect(toRawValue('logVol', [])).toBeNull();
  });
});

describe('toRawValue — freeApp', () => {
  it('returns Total/Free string', () => {
    expect(toRawValue('freeApp', { TOTAL_MEM: 64, AVAILABLE_MEM: 20 })).toBe('Total: 64 GB / Free: 20 GB');
  });
  it('returns null for invalid payload', () => {
    expect(toRawValue('freeApp', {})).toBeNull();
  });
});

describe('toRawValue — freeDb', () => {
  it('returns used/total string', () => {
    expect(toRawValue('freeDb', { USED_GB: 10, LIMIT_GB: 50 })).toBe('10 GB /50 GB');
  });
});

describe('toRawValue — st22', () => {
  it('returns dump count as string', () => {
    expect(toRawValue('st22', [{ DUMPID: 1 }, { DUMPID: 2 }])).toBe('2');
    expect(toRawValue('st22', [])).toBe('0');
  });
  it('returns null for non-array', () => {
    expect(toRawValue('st22', null)).toBeNull();
  });
});

describe('toRawValue — backup', () => {
  it('prepends Backup to status string', () => {
    expect(toRawValue('backup', { BACKUP_STATUS: 'successful' })).toBe('Backup successful');
  });
  it('returns null for missing or blank status', () => {
    expect(toRawValue('backup', { BACKUP_STATUS: '' })).toBeNull();
    expect(toRawValue('backup', {})).toBeNull();
  });
});

describe('toRawValue — sm13', () => {
  it('passes through the status string verbatim', () => {
    expect(toRawValue('sm13', 'Update is Active')).toBe('Update is Active');
  });
  it('returns null for non-string or blank', () => {
    expect(toRawValue('sm13', '')).toBeNull();
    expect(toRawValue('sm13', 42)).toBeNull();
  });
});

describe('toRawValue — sm12', () => {
  it('returns lock entry count', () => {
    expect(toRawValue('sm12', { LOCK_ENTRIES: [1, 2, 3] })).toBe('3');
    expect(toRawValue('sm12', { LOCK_ENTRIES: [] })).toBe('0');
  });
  it('returns null for missing LOCK_ENTRIES', () => {
    expect(toRawValue('sm12', {})).toBeNull();
  });
});

describe('toRawValue — sm51', () => {
  it('returns server state string', () => {
    expect(toRawValue('sm51', { STATE: 'Active' })).toBe('Active');
  });
  it('returns null for blank or missing state', () => {
    expect(toRawValue('sm51', { STATE: '' })).toBeNull();
    expect(toRawValue('sm51', {})).toBeNull();
  });
});

describe('toRawValue — sm50', () => {
  it('returns "All Ok" when threshold is 0', () => {
    expect(toRawValue('sm50', { WP_GT_THRESHOLD: 0 })).toBe('All Ok');
  });
  it('returns count message when threshold > 0', () => {
    expect(toRawValue('sm50', { WP_GT_THRESHOLD: 3 })).toContain('3');
  });
  it('returns null for non-finite threshold', () => {
    expect(toRawValue('sm50', { WP_GT_THRESHOLD: 'x' })).toBeNull();
  });
});

describe('toRawValue — st06', () => {
  it('returns "All OK - ..." when all components are ok', () => {
    const result = toRawValue('st06', { MEM_OK: 'Memory Ok!', SWAP_OK: 'Swap Ok!', CPU_OK: 'CPU Ok!' });
    expect(result).toMatch(/^All OK/i);
  });
  it('returns detail string without "All OK" prefix when any is not ok', () => {
    const result = toRawValue('st06', { MEM_OK: 'Memory critical', SWAP_OK: 'Swap Ok!', CPU_OK: 'CPU Ok!' });
    expect(result).not.toMatch(/^All OK/i);
    expect(result).toContain('Memory critical');
  });
  it('returns null when all fields are empty', () => {
    expect(toRawValue('st06', {})).toBeNull();
  });
});

describe('toRawValue — sm37', () => {
  it('returns "No long running jobs found" for count 0', () => {
    expect(toRawValue('sm37', { NO_OF_LONG_RUNNING_JOBS: 0 })).toBe('No long running jobs found');
  });
  it('returns count message for >0', () => {
    expect(toRawValue('sm37', { NO_OF_LONG_RUNNING_JOBS: 2 })).toContain('2');
  });
});

describe('toRawValue — smq1 / smq2', () => {
  it('returns "No queues found" for 0', () => {
    expect(toRawValue('smq1', { NO_OF_ERROR_QUEUES: 0 })).toBe('No queues found');
    expect(toRawValue('smq2', { NO_OF_ERROR_QUEUES: 0 })).toBe('No queues found');
  });
  it('returns count message for >0', () => {
    expect(toRawValue('smq1', { NO_OF_ERROR_QUEUES: 4 })).toContain('4');
  });
});

describe('toRawValue — sm21', () => {
  it('returns no-entry message for 0', () => {
    expect(toRawValue('sm21', { NO_OF_SYSLOG_MSG: 0 })).toBe('No high priority entry found');
  });
  it('uses singular "entry" for count 1', () => {
    expect(toRawValue('sm21', { NO_OF_SYSLOG_MSG: 1 })).toContain('1 high priority entry');
  });
  it('uses plural "entries" for count > 1', () => {
    expect(toRawValue('sm21', { NO_OF_SYSLOG_MSG: 3 })).toContain('entries');
  });
});

describe('toRawValue — sm58', () => {
  it('returns pending tRFC count string', () => {
    expect(toRawValue('sm58', { NO_OF_TRFCS: 5 })).toBe('5 pending tRFC(s)');
    expect(toRawValue('sm58', { NO_OF_TRFCS: 0 })).toBe('0 pending tRFC(s)');
  });
});

describe('toRawValue — cancel', () => {
  it('returns "No cancelled jobs found" for empty array', () => {
    expect(toRawValue('cancel', [])).toBe('No cancelled jobs found');
  });
  it('returns count for non-empty array', () => {
    expect(toRawValue('cancel', [1, 2])).toContain('2');
  });
  it('returns null for non-array', () => {
    expect(toRawValue('cancel', null)).toBeNull();
  });
});

describe('toRawValue — strust / strustToday / strust15d', () => {
  const payload = [
    { TAG: 'Already Expired', NO_OF_CERTIFICATES: 2, CERT_DETAILS: [] },
    { TAG: 'Expiring Today', NO_OF_CERTIFICATES: 0, CERT_DETAILS: [] },
    { TAG: 'Expiring in 15 Days', NO_OF_CERTIFICATES: 3, CERT_DETAILS: [] },
  ];

  it('returns count for matching tag', () => {
    expect(toRawValue('strust', payload)).toBe('2');
    expect(toRawValue('strustToday', payload)).toBe('0');
    expect(toRawValue('strust15d', payload)).toBe('3');
  });

  it('returns "0" when tag not found', () => {
    expect(toRawValue('strust', [])).toBe('0');
  });
});

describe('toRawValue — user count checks', () => {
  it('locked — returns count string', () => {
    expect(toRawValue('locked', { NO_OF_LOCKED_USERS: 3 })).toBe('3');
  });
  it('inactive — returns count string', () => {
    expect(toRawValue('inactive', { NO_OF_INACTIVE_USERS: 0 })).toBe('0');
  });
  it('highPriv — returns count string', () => {
    expect(toRawValue('highPriv', { NO_OF_HIGH_PREV_USERS: 5 })).toBe('5');
  });
  it('returns null for non-finite counts', () => {
    expect(toRawValue('locked', {})).toBeNull();
    expect(toRawValue('inactive', {})).toBeNull();
  });
});

// ── toDumpDetails ──────────────────────────────────────────────────────────────

describe('toDumpDetails', () => {
  it('returns null for non-st22 check keys', () => {
    expect(toDumpDetails('backup', [])).toBeNull();
  });
  it('returns null for non-array payload', () => {
    expect(toDumpDetails('st22', null)).toBeNull();
  });
  it('maps dump rows correctly', () => {
    const rows = [
      { SYDATE: '2026-09-30', SYTIME: '12:00:00', SYHOST: 'saphost', SYUSER: 'JDOE',
        DUMPID: 'D001', PROGRAMNAME: 'PROG1', INCLUDENAME: 'INC1', LINENUMBER: 42 },
    ];
    const result = toDumpDetails('st22', rows);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      dumpDate: '2026-09-30',
      dumpTime: '12:00:00',
      host: 'saphost',
      sapUser: 'JDOE',
      dumpId: 'D001',
      programName: 'PROG1',
      lineNumber: '42',
    });
  });
  it('returns empty array for empty payload', () => {
    expect(toDumpDetails('st22', [])).toEqual([]);
  });
});

// ── toBackupLogDetails ─────────────────────────────────────────────────────────

describe('toBackupLogDetails', () => {
  it('returns null for non-backup check', () => {
    expect(toBackupLogDetails('st22', {})).toBeNull();
  });
  it('returns null when BACKUP_LOG is missing or not an array', () => {
    expect(toBackupLogDetails('backup', {})).toBeNull();
  });
  it('maps valid timestamp strings', () => {
    const payload = {
      BACKUP_LOG: [{ ENTRY_TYPE: 'DATA', START_TIME: '2026-09-30 01:00:00',
        END_TIME: '2026-09-30 02:00:00', STATE: 'SUCCESSFUL', COMMENT: 'ok' }],
    };
    const result = toBackupLogDetails('backup', payload);
    expect(result[0].entryStart).toBe('2026-09-30 01:00:00');
    expect(result[0].entryEnd).toBe('2026-09-30 02:00:00');
    expect(result[0].entryType).toBe('DATA');
    expect(result[0].entryState).toBe('SUCCESSFUL');
  });
  it('rejects malformed timestamp strings', () => {
    const payload = { BACKUP_LOG: [{ START_TIME: 'not-a-date', END_TIME: null }] };
    const result = toBackupLogDetails('backup', payload);
    expect(result[0].entryStart).toBeNull();
    expect(result[0].entryEnd).toBeNull();
  });
});

// ── toLockDetails ──────────────────────────────────────────────────────────────

describe('toLockDetails', () => {
  it('returns null for non-sm12 check', () => {
    expect(toLockDetails('sm51', {})).toBeNull();
  });
  it('maps lock entries and combines date+time', () => {
    const payload = {
      LOCK_ENTRIES: [{ GUNAME: 'USER1', GNAME: 'TABLE1', GMODE: 'E', GTDATE: '20260930', GTTIME: '120000' }],
    };
    const result = toLockDetails('sm12', payload);
    expect(result[0].lockUser).toBe('USER1');
    expect(result[0].lockTime).toBe('20260930 120000');
    expect(result[0].durationHrs).toBeNull();
  });
});

// ── toJobDetails ───────────────────────────────────────────────────────────────

describe('toJobDetails', () => {
  it('returns null for non-sm37 check', () => {
    expect(toJobDetails('sm50', {})).toBeNull();
  });
  it('maps job rows', () => {
    const payload = { LONG_RUNNING_JOBLIST: [{ JOBNAME: 'MYJOB', SDLSTRTDT: '20260930', SDLSTRTTM: '120000' }] };
    const result = toJobDetails('sm37', payload);
    expect(result[0]).toMatchObject({ jobName: 'MYJOB', schedDate: '20260930', schedTime: '120000' });
  });
});

// ── toCancelJobDetails ─────────────────────────────────────────────────────────

describe('toCancelJobDetails', () => {
  it('returns null for non-cancel check', () => {
    expect(toCancelJobDetails('sm37', [])).toBeNull();
  });
  it('maps cancel job rows', () => {
    const payload = [{ JOBNAME: 'CJOB', SDLSTRTDT: '20260930', RELUNAME: 'USER1',
      NEWFLAG: 'C', WPPROCID: 5 }];
    const result = toCancelJobDetails('cancel', payload);
    expect(result[0].jobName).toBe('CJOB');
    expect(result[0].wpProcess).toBe('5');
    expect(result[0].status).toBe('C');
  });
});

// ── toCertDetails ─────────────────────────────────────────────────────────────

describe('toCertDetails', () => {
  it('returns null for non-strust check keys', () => {
    expect(toCertDetails('backup', [])).toBeNull();
  });
  const payload = [
    { TAG: 'Already Expired', CERT_DETAILS: [{ RESULT: 'expired', CERTIFICATE: 'CN=SAP', VALID_FROM: '2020-01-01', VALID_TO: '2023-01-01' }] },
  ];
  it('extracts cert details for matching tag', () => {
    const result = toCertDetails('strust', payload);
    expect(result).toHaveLength(1);
    expect(result[0].certificate).toBe('CN=SAP');
  });
  it('returns null when tag group has no CERT_DETAILS array', () => {
    expect(toCertDetails('strustToday', payload)).toBeNull();
  });
});

// ── toQueueErrorDetails ────────────────────────────────────────────────────────

describe('toQueueErrorDetails', () => {
  it('returns null for non-smq check', () => {
    expect(toQueueErrorDetails('sm58', {})).toBeNull();
  });
  it('maps queue error rows for smq1 and smq2', () => {
    const payload = { ERROR_QTABLE: [{ QNAME: 'Q1', DEST: 'DEST1', QSTATE: 'SYSFAIL' }] };
    for (const key of ['smq1', 'smq2']) {
      const result = toQueueErrorDetails(key, payload);
      expect(result[0].queueName).toBe('Q1');
      expect(result[0].destination).toBe('DEST1');
    }
  });
});

// ── toServerDetails ────────────────────────────────────────────────────────────

describe('toServerDetails', () => {
  it('returns null for non-sm51 check', () => {
    expect(toServerDetails('sm50', {})).toBeNull();
  });
  it('maps server list', () => {
    const payload = { SERVER_LIST: [{ NAME: 'SRV1', HOST: 'host1', HOSTNAMELONG: 'host1.domain', HOSTADDR_V4_STR: '10.0.0.1' }] };
    const result = toServerDetails('sm51', payload);
    expect(result[0]).toMatchObject({ serverName: 'SRV1', host: 'host1', hostAddr: '10.0.0.1' });
  });
});

// ── toWorkerDetails ────────────────────────────────────────────────────────────

describe('toWorkerDetails', () => {
  it('returns null for non-sm50 check', () => {
    expect(toWorkerDetails('sm51', {})).toBeNull();
  });
  it('falls back to MAIN_PROGRAM when WP_PROGRAM is blank', () => {
    const payload = {
      WORKER_LIST_DISP: [{ WP_INDEX: 1, WP_PROGRAM: '', MAIN_PROGRAM: 'MAINPROG', PID: 1234 }],
    };
    const result = toWorkerDetails('sm50', payload);
    expect(result[0].wpProgram).toBe('MAINPROG');
    expect(result[0].wpPid).toBe(1234);
    expect(result[0].wpIndex).toBe('1');
  });
});

// ── user detail extractors ─────────────────────────────────────────────────────

describe('toLockedUserDetails', () => {
  it('returns null for wrong check key', () => {
    expect(toLockedUserDetails('inactive', {})).toBeNull();
  });
  it('maps user rows', () => {
    const payload = { LOCKED_USERS: [{ BNAME: 'JDOE', NAME_FIRST: 'John', NAME_LAST: 'Doe' }] };
    const result = toLockedUserDetails('locked', payload);
    expect(result[0]).toMatchObject({ userName: 'JDOE', firstName: 'John', lastName: 'Doe' });
  });
});

describe('toHighPrivUserDetails', () => {
  it('maps high-priv user rows', () => {
    const payload = { HIGH_PREV_USERS: [{ BNAME: 'SAP*', PROFILE: 'SAP_ALL', MANDT: '100' }] };
    const result = toHighPrivUserDetails('highPriv', payload);
    expect(result[0]).toMatchObject({ userName: 'SAP*', profile: 'SAP_ALL', client: '100' });
  });
});

describe('toGhostRoleDetails', () => {
  it('maps ghost role rows', () => {
    const payload = { GHOST_ROLES: [{ BNAME: 'USER1', AGR_NAME: 'Z_GHOST', STATUS: 'active' }] };
    const result = toGhostRoleDetails('ghostRoles', payload);
    expect(result[0]).toMatchObject({ userName: 'USER1', roleName: 'Z_GHOST', status: 'active' });
  });
});

describe('toEmptyShellDetails', () => {
  it('returns null for wrong check key', () => {
    expect(toEmptyShellDetails('locked', {})).toBeNull();
  });
  it('maps empty-shell user rows', () => {
    const payload = { USER_DETAILS: [{ BNAME: 'EMPTY1', AGR_NAME: 'ROLE1', USER_VALID: 'N', ROLE_VALID: 'Y', STATUS: 'active' }] };
    const result = toEmptyShellDetails('emptyShell', payload);
    expect(result[0]).toMatchObject({ userName: 'EMPTY1', userValid: 'N', roleValid: 'Y' });
  });
});
