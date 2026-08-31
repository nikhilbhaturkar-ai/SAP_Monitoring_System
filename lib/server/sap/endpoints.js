/**
 * What the collector asks each system for, one descriptor per monitoring check.
 *
 * PLACEHOLDER — the real SAP API contract is not known yet. Every `path` is
 * null, which makes the client skip that check (see client.js). Filling in a
 * path is all it takes to bring one check online; the matching response
 * mapper lives in mappers.js.
 *
 *   checkKey  — must match a `checks.key` row from db/seed.sql
 *   method    — HTTP verb
 *   path      — appended to config.sap.baseUrls[sid]; null = not configured yet
 *   appliesTo — 'sap' for the ABAP systems, 'url' for the endpoint tiles;
 *               matches `systems.kind`
 *
 * One path list is shared by every `appliesTo: 'sap'` system — only the host
 * (config.sap.baseUrls[sid]) varies per SID. That holds today because MSD and
 * MSP both expose the same Z-services under the same sap-client per service
 * (dataVol/logVol/st22 use 100; backup/sm13/sm12/sm51 use 150 — the client
 * number is part of each Z-service's own path, not a per-system setting, so it
 * stays fixed here regardless of which SID ends up calling it). If a system
 * ever needs a different client for the *same* service, or a different
 * service name outright, `path` here would need to become per-SID rather than
 * global — nothing in endpointsForKind() prevents that, but it isn't built
 * until a real case needs it.
 *
 * TODO(SAP): replace each null path with the real endpoint, e.g.
 *   { checkKey: 'st22', method: 'GET', path: '/sap/opu/odata/…/DumpsSet?$top=1', appliesTo: 'sap' }
 */
export const CHECK_ENDPOINTS = [
  // DBA Cockpit volumes
  {
    checkKey: 'dataVol',
    method: 'GET',
    path: '/sap/bc/abap/z_data_vol_srv/data_volume?sap-client=100',
    appliesTo: 'sap',
  },
  {
    checkKey: 'logVol',
    method: 'GET',
    path: '/sap/bc/abap/z_log_vol_srv/log_volume?sap-client=100',
    appliesTo: 'sap',
  },

  // Transaction-code checks
  {
    checkKey: 'st22',
    method: 'GET',
    path: '/sap/bc/abap/z_st22_err_srv/st22_errors?sap-client=100',
    appliesTo: 'sap',
  },
  {
    checkKey: 'backup',
    method: 'GET',
    path: '/sap/bc/abap/z_backup_srv/backup?sap-client=150',
    appliesTo: 'sap',
  },
  {
    checkKey: 'sm13',
    method: 'GET',
    path: '/sap/bc/abap/z_sm13_upd_srv/update?sap-client=150',
    appliesTo: 'sap',
  },
  {
    checkKey: 'sm12',
    method: 'GET',
    path: '/sap/bc/abap/z_sm12_lock_srv/locks?sap-client=150',
    appliesTo: 'sap',
  },
  {
    checkKey: 'sm51',
    method: 'GET',
    path: '/sap/bc/abap/z_sm51_statesrv/sm51?sap-client=150',
    appliesTo: 'sap',
  },
  {
    checkKey: 'sm50',
    method: 'GET',
    path: '/sap/bc/abap/z_sm50_wp_srv/sm50?sap-client=100',
    appliesTo: 'sap',
  },
  {
    checkKey: 'st06',
    method: 'GET',
    path: '/sap/bc/abap/z_st06_data_srv/st06?sap-client=150',
    appliesTo: 'sap',
  },
  {
    checkKey: 'sm37',
    method: 'GET',
    path: '/sap/bc/abap/z_sm37_jobs_srv/sm37?sap-client=150',
    appliesTo: 'sap',
  },
  {
    checkKey: 'smq1',
    method: 'GET',
    path: '/sap/bc/abap/z_smq1_outb_srv/smq1?sap-client=150',
    appliesTo: 'sap',
  },
  {
    checkKey: 'smq2',
    method: 'GET',
    path: '/sap/bc/abap/z_smq2_inb_srv/smq2?sap-client=150',
    appliesTo: 'sap',
  },
  {
    checkKey: 'sm20',
    method: 'GET',
    path: '/sap/bc/abap/z_sm20_log_srv/sm20?sap-client=150',
    appliesTo: 'sap',
  },
  {
    checkKey: 'sm21',
    method: 'GET',
    path: '/sap/bc/abap/z_sm21_log_srv/sm21?sap-client=150',
    appliesTo: 'sap',
  },
  {
    checkKey: 'sm58',
    method: 'GET',
    path: '/sap/bc/abap/z_sm58_trfc_srv/sm58?sap-client=150',
    appliesTo: 'sap',
  },
  {
    checkKey: 'cancel',
    method: 'GET',
    path: '/sap/bc/abap/z_cancel_jobs/cancel?sap-client=150',
    appliesTo: 'sap',
  },
  {
    checkKey: 'strust',
    method: 'GET',
    path: '/sap/bc/abap/z_strust_srv/strust?sap-client=150',
    appliesTo: 'sap',
  },

  // OS-level free space (item 17/18 reuse the ST06 / DBA Cockpit services at
  // sap-client=150, distinct from st06's/dataVol's own client=100 calls)
  {
    checkKey: 'freeApp',
    method: 'GET',
    path: '/sap/bc/abap/z_st06_data_srv/st06?sap-client=150',
    appliesTo: 'sap',
  },
  {
    checkKey: 'freeDb',
    method: 'GET',
    path: '/sap/bc/abap/z_data_vol_srv/data_volume?sap-client=150',
    appliesTo: 'sap',
  },

  // Endpoint tiles: reachability of the published URLs
  { checkKey: 'urlStatus', method: 'GET', path: null, appliesTo: 'url' }, // TODO(SAP)
];

/** Descriptors that apply to a given system kind ('sap' | 'url'). */
export function endpointsForKind(kind) {
  return CHECK_ENDPOINTS.filter((e) => e.appliesTo === kind);
}
