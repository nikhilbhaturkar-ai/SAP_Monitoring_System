/**
 * HTTP access to the SAP monitoring APIs.
 *
 * PLACEHOLDER — no real endpoints are configured yet. `fetchCheck` never
 * throws: an unconfigured system or check returns { status: 'skipped' } and a
 * failing request returns { status: 'error' }, so one bad host can never abort
 * a collection cycle.
 */
import { config } from '../config.js';

/** Auth header for the configured mode, or null when the API is anonymous. */
function authHeader() {
  const { authMode, username, password, token } = config.sap;

  if (authMode === 'basic') {
    if (!username || !password) return null;
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }
  if (authMode === 'bearer') {
    return token ? `Bearer ${token}` : null;
  }
  return null;
}

/** Base URL configured for a SID, or '' when the system is not wired up yet. */
export function baseUrlFor(sid) {
  return config.sap.baseUrls[sid] || '';
}

function joinUrl(base, path) {
  return `${base.replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`;
}

/**
 * Fetch one check from one system.
 *
 * @returns {Promise<{status:'ok'|'skipped'|'error', payload?:unknown, reason?:string, error?:string}>}
 */
export async function fetchCheck(system, descriptor) {
  const base = baseUrlFor(system.sid);
  if (!base) {
    return { status: 'skipped', reason: `no SAP_BASE_URL_${system.sid} configured` };
  }
  if (!descriptor.path) {
    return { status: 'skipped', reason: `no endpoint path defined for ${descriptor.checkKey}` };
  }

  const url = joinUrl(base, descriptor.path);
  const headers = { Accept: 'application/json' };
  const auth = authHeader();
  if (auth) headers.Authorization = auth;

  // One bounded retry: SAP gateways drop the occasional connection, but a
  // genuinely down host should not stall the 15-minute budget.
  const attempts = Math.max(1, config.sap.retries + 1);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: descriptor.method || 'GET',
        headers,
        signal: AbortSignal.timeout(config.sap.timeoutMs),
      });

      if (!response.ok) {
        lastError = `HTTP ${response.status} ${response.statusText}`;
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('json')
        ? await response.json()
        : await response.text();

      return { status: 'ok', payload };
    } catch (err) {
      lastError = err.name === 'TimeoutError' ? `timed out after ${config.sap.timeoutMs}ms` : err.message;
    }
  }

  return { status: 'error', error: lastError };
}
