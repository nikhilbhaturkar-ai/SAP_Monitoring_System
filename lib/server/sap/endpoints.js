/**
 * Per-client endpoint definitions for each SAP monitoring check.
 *
 * Each key is a sap-client number (as a string). Systems are routed to their
 * own independent endpoint set — there is no shared base list or override
 * merging. Adding a new client means adding a new key here with a full set.
 *
 *   checkKey  — must match a `checks.key` row from db/seed.sql
 *   method    — HTTP verb
 *   path      — appended to config.sap.baseUrls[sid]; null = not configured yet
 *   appliesTo — 'sap' for the ABAP systems, 'url' for the endpoint tiles
 */

const ENDPOINTS_100 = [
  // DBA Cockpit volumes
  { checkKey: 'dataVol',          method: 'GET', path: '/sap/bc/abap/z_data_vol_srv/data_volume?sap-client=100',         appliesTo: 'sap' },
  { checkKey: 'logVol',           method: 'GET', path: '/sap/bc/abap/z_log_vol_srv/log_volume?sap-client=100',           appliesTo: 'sap' },

  // Transaction-code checks
  { checkKey: 'st22',             method: 'GET', path: '/sap/bc/abap/z_st22_err_srv/st22_errors?sap-client=100',         appliesTo: 'sap' },
  { checkKey: 'backup',           method: 'GET', path: '/sap/bc/abap/z_backup_srv/backup?sap-client=100',                appliesTo: 'sap' },
  { checkKey: 'sm13',             method: 'GET', path: '/sap/bc/abap/z_sm13_upd_srv/update?sap-client=100',              appliesTo: 'sap' },
  { checkKey: 'sm12',             method: 'GET', path: '/sap/bc/abap/z_sm12_lock_srv/locks?sap-client=100',              appliesTo: 'sap' },
  { checkKey: 'sm51',             method: 'GET', path: '/sap/bc/abap/z_sm51_statesrv/sm51?sap-client=100',               appliesTo: 'sap' },
  { checkKey: 'sm50',             method: 'GET', path: '/sap/bc/abap/z_sm50_wp_srv/sm50?sap-client=100',                 appliesTo: 'sap' },
  { checkKey: 'st06',             method: 'GET', path: '/sap/bc/abap/z_st06_data_srv/st06?sap-client=100',               appliesTo: 'sap' },
  { checkKey: 'sm37',             method: 'GET', path: '/sap/bc/abap/z_sm37_jobs_srv/sm37?sap-client=100',               appliesTo: 'sap' },
  { checkKey: 'smq1',             method: 'GET', path: '/sap/bc/abap/z_smq1_outb_srv/smq1?sap-client=100',               appliesTo: 'sap' },
  { checkKey: 'smq2',             method: 'GET', path: '/sap/bc/abap/z_smq2_inb_srv/smq2?sap-client=100',                appliesTo: 'sap' },
  { checkKey: 'sm20',             method: 'GET', path: '/sap/bc/abap/z_sm20_log_srv/sm20?sap-client=100',                appliesTo: 'sap' },
  { checkKey: 'sm21',             method: 'GET', path: '/sap/bc/abap/z_sm21_log_srv/sm21?sap-client=100',                appliesTo: 'sap' },
  { checkKey: 'sm58',             method: 'GET', path: '/sap/bc/abap/z_sm58_trfc_srv/sm58?sap-client=100',               appliesTo: 'sap' },
  { checkKey: 'cancel',           method: 'GET', path: '/sap/bc/abap/z_cancel_jobs/cancel?sap-client=100',               appliesTo: 'sap' },
  { checkKey: 'strust',           method: 'GET', path: '/sap/bc/abap/z_strust_srv/strust?sap-client=100',                appliesTo: 'sap' },
  { checkKey: 'strustToday',      method: 'GET', path: '/sap/bc/abap/z_strust_srv/strust?sap-client=100',                appliesTo: 'sap' },
  { checkKey: 'strust15d',        method: 'GET', path: '/sap/bc/abap/z_strust_srv/strust?sap-client=100',                appliesTo: 'sap' },
  { checkKey: 'freeApp',          method: 'GET', path: '/sap/bc/abap/z_st06_data_srv/st06?sap-client=100',               appliesTo: 'sap' },
  { checkKey: 'freeDb',           method: 'GET', path: '/sap/bc/abap/z_data_vol_srv/data_volume?sap-client=100',         appliesTo: 'sap' },

  // Endpoint tiles
  { checkKey: 'urlStatus',        method: 'GET', path: null,                                                              appliesTo: 'url' },

  // Security Monitoring
  { checkKey: 'locked',           method: 'GET', path: '/sap/bc/abap/z_lock_user/lockedusers?sap-client=100',            appliesTo: 'sap' },
  { checkKey: 'inactive',         method: 'GET', path: '/sap/bc/abap/z_inact_user/inactiveusers?sap-client=100',         appliesTo: 'sap' },
  { checkKey: 'highPriv',         method: 'GET', path: '/sap/bc/abap/z_priv_user/highprivusers?sap-client=100',          appliesTo: 'sap' },
  { checkKey: 'unassignedRoles',  method: 'GET', path: '/sap/bc/abap/z_unused_roles/unusedroles?sap-client=100',         appliesTo: 'sap' },
  { checkKey: 'ghostRoles',       method: 'GET', path: '/sap/bc/abap/z_ghost_roles/ghostroles?sap-client=100',           appliesTo: 'sap' },
  { checkKey: 'unusedProfiles',   method: 'GET', path: '/sap/bc/abap/z_unused_profil/unusedprofiles?sap-client=100',     appliesTo: 'sap' },
  { checkKey: 'unusedTcodes',     method: 'GET', path: '/sap/bc/abap/z_unused_tcodes/unusedtcodes?sap-client=100',       appliesTo: 'sap' },
  { checkKey: 'undeletedUsers',   method: 'GET', path: '/sap/bc/abap/z_undeleted_usr/undeletedusers?sap-client=100',     appliesTo: 'sap' },
  { checkKey: 'redundantRoles',   method: 'GET', path: '/sap/bc/abap/z_redudant_role/redudantroles?sap-client=100',      appliesTo: 'sap' },
  { checkKey: 'emptyShell',       method: 'GET', path: '/sap/bc/abap/z_empty_shell/emptyshell?sap-client=100',           appliesTo: 'sap' },
];

const ENDPOINTS_150 = [
  // DBA Cockpit volumes
  { checkKey: 'dataVol',          method: 'GET', path: '/sap/bc/abap/z_data_vol_srv/data_volume?sap-client=150',         appliesTo: 'sap' },
  { checkKey: 'logVol',           method: 'GET', path: '/sap/bc/abap/z_log_vol_srv/log_volume?sap-client=150',           appliesTo: 'sap' },

  // Transaction-code checks
  { checkKey: 'st22',             method: 'GET', path: '/sap/bc/abap/z_st22_err_srv/st22_errors?sap-client=150',         appliesTo: 'sap' },
  { checkKey: 'backup',           method: 'GET', path: '/sap/bc/abap/z_backup_srv/backup?sap-client=150',                appliesTo: 'sap' },
  { checkKey: 'sm13',             method: 'GET', path: '/sap/bc/abap/z_sm13_upd_srv/update?sap-client=150',              appliesTo: 'sap' },
  { checkKey: 'sm12',             method: 'GET', path: '/sap/bc/abap/z_sm12_lock_srv/locks?sap-client=150',              appliesTo: 'sap' },
  { checkKey: 'sm51',             method: 'GET', path: '/sap/bc/abap/z_sm51_statesrv/sm51?sap-client=150',               appliesTo: 'sap' },
  { checkKey: 'sm50',             method: 'GET', path: '/sap/bc/abap/z_sm50_wp_srv/sm50?sap-client=150',                 appliesTo: 'sap' },
  { checkKey: 'st06',             method: 'GET', path: '/sap/bc/abap/z_st06_data_srv/st06?sap-client=150',               appliesTo: 'sap' },
  { checkKey: 'sm37',             method: 'GET', path: '/sap/bc/abap/z_sm37_jobs_srv/sm37?sap-client=150',               appliesTo: 'sap' },
  { checkKey: 'smq1',             method: 'GET', path: '/sap/bc/abap/z_smq1_outb_srv/smq1?sap-client=150',               appliesTo: 'sap' },
  { checkKey: 'smq2',             method: 'GET', path: '/sap/bc/abap/z_smq2_inb_srv/smq2?sap-client=150',                appliesTo: 'sap' },
  { checkKey: 'sm20',             method: 'GET', path: '/sap/bc/abap/z_sm20_log_srv/sm20?sap-client=150',                appliesTo: 'sap' },
  { checkKey: 'sm21',             method: 'GET', path: '/sap/bc/abap/z_sm21_log_srv/sm21?sap-client=150',                appliesTo: 'sap' },
  { checkKey: 'sm58',             method: 'GET', path: '/sap/bc/abap/z_sm58_trfc_srv/sm58?sap-client=150',               appliesTo: 'sap' },
  { checkKey: 'cancel',           method: 'GET', path: '/sap/bc/abap/z_cancel_jobs/cancel?sap-client=150',               appliesTo: 'sap' },
  { checkKey: 'strust',           method: 'GET', path: '/sap/bc/abap/z_strust_srv/strust?sap-client=150',                appliesTo: 'sap' },
  { checkKey: 'strustToday',      method: 'GET', path: '/sap/bc/abap/z_strust_srv/strust?sap-client=150',                appliesTo: 'sap' },
  { checkKey: 'strust15d',        method: 'GET', path: '/sap/bc/abap/z_strust_srv/strust?sap-client=150',                appliesTo: 'sap' },
  { checkKey: 'freeApp',          method: 'GET', path: '/sap/bc/abap/z_st06_data_srv/st06?sap-client=150',               appliesTo: 'sap' },
  { checkKey: 'freeDb',           method: 'GET', path: '/sap/bc/abap/z_data_vol_srv/data_volume?sap-client=150',         appliesTo: 'sap' },

  // Endpoint tiles
  { checkKey: 'urlStatus',        method: 'GET', path: null,                                                              appliesTo: 'url' },

  // Security Monitoring
  { checkKey: 'locked',           method: 'GET', path: '/sap/bc/abap/z_lock_user/lockedusers?sap-client=150',            appliesTo: 'sap' },
  { checkKey: 'inactive',         method: 'GET', path: '/sap/bc/abap/z_inact_user/inactiveusers?sap-client=150',         appliesTo: 'sap' },
  { checkKey: 'highPriv',         method: 'GET', path: '/sap/bc/abap/z_priv_user/highprivusers?sap-client=150',          appliesTo: 'sap' },
  { checkKey: 'unassignedRoles',  method: 'GET', path: '/sap/bc/abap/z_unused_roles/unusedroles?sap-client=150',         appliesTo: 'sap' },
  { checkKey: 'ghostRoles',       method: 'GET', path: '/sap/bc/abap/z_ghost_roles/ghostroles?sap-client=150',           appliesTo: 'sap' },
  { checkKey: 'unusedProfiles',   method: 'GET', path: '/sap/bc/abap/z_unused_profil/unusedprofiles?sap-client=150',     appliesTo: 'sap' },
  { checkKey: 'unusedTcodes',     method: 'GET', path: '/sap/bc/abap/z_unused_tcodes/unusedtcodes?sap-client=150',       appliesTo: 'sap' },
  { checkKey: 'undeletedUsers',   method: 'GET', path: '/sap/bc/abap/z_undeleted_usr/undeletedusers?sap-client=150',     appliesTo: 'sap' },
  { checkKey: 'redundantRoles',   method: 'GET', path: '/sap/bc/abap/z_redudant_role/redudantroles?sap-client=150',      appliesTo: 'sap' },
  { checkKey: 'emptyShell',       method: 'GET', path: '/sap/bc/abap/z_empty_shell/emptyshell?sap-client=150',           appliesTo: 'sap' },
];

/**
 * Maps a sap-client number extracted from a system's SID (e.g. "MSD_100" → "100")
 * to its dedicated endpoint list. Add a new entry here when onboarding a new client.
 */
const ENDPOINTS_BY_CLIENT = {
  '100': ENDPOINTS_100,
  '150': ENDPOINTS_150,
};

/**
 * Explicit client assignment for SIDs that have no _NNN suffix.
 * SIDs not listed here (MSP, MGP, SPA, …) have no endpoints yet and are skipped.
 */
const SID_CLIENT_OVERRIDE = {
  'MSD': '100',
};

/**
 * Resolves the sap-client for a SID:
 *   1. Suffix match  — "MSD_150" → "150"
 *   2. Explicit map  — "MSD"     → "100"  (via SID_CLIENT_OVERRIDE)
 *   3. No match      → null (system will be skipped)
 */
function clientFromSid(sid) {
  const suffixMatch = sid && sid.match(/_(\d+)$/);
  if (suffixMatch) return suffixMatch[1];
  return SID_CLIENT_OVERRIDE[sid] ?? null;
}

/**
 * Returns the endpoint descriptors for a system, filtered to its kind.
 * Each system is served exclusively by its own client's endpoint list —
 * there is no fallback to another client's paths.
 */
export function endpointsForSystem(system) {
  const client = clientFromSid(system.sid);
  const list = client && ENDPOINTS_BY_CLIENT[client];
  if (!list) {
    console.warn(`[endpoints] no endpoint list for SID "${system.sid}" — skipping`);
    return [];
  }
  return list.filter((e) => e.appliesTo === system.kind);
}

/**
 * Returns endpoint descriptors for a given kind across all clients.
 * Used only for schema/seed validation; production code should call endpointsForSystem.
 */
export function endpointsForKind(kind) {
  return Object.values(ENDPOINTS_BY_CLIENT)
    .flatMap((list) => list.filter((e) => e.appliesTo === kind));
}
