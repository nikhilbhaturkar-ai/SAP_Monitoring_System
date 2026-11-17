/**
 * Live proxy for the SAP ghost (unused) roles endpoint.
 * Used by the Unused Roles (Ghost) dialog to refresh its list after a role is
 * deleted — the dashboard payload only reflects the last collection cycle.
 * Rows are shaped by the same mapper the collector uses, so the dialog's
 * table spec reads them identically.
 */
import { config } from '../../../lib/server/config.js';
import { toGhostRoleDetails } from '../../../lib/server/sap/mappers.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAP_GHOST_ROLES_URL =
  'http://mpcls4hdevapp.mpower.com.qa:8000/sap/bc/abap/z_ghost_roles/ghostroles?sap-client=100&sap-language=EN';

function buildAuthHeader() {
  const { authMode, username, password, token } = config.sap;
  if (authMode === 'basic' && username && password) {
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }
  if (authMode === 'bearer' && token) {
    return `Bearer ${token}`;
  }
  return null;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function GET() {
  const headers = { Accept: 'application/json' };
  const auth = buildAuthHeader();
  if (auth) headers['Authorization'] = auth;

  try {
    const upstream = await fetch(SAP_GHOST_ROLES_URL, {
      headers,
      signal: AbortSignal.timeout(config.sap.timeoutMs),
    });
    if (!upstream.ok) {
      return json({ error: `SAP ghost-roles endpoint returned HTTP ${upstream.status}` }, upstream.status);
    }
    const payload = await upstream.json();
    // No GHOST_ROLES array means nothing is left — an empty list, not an error.
    return json(toGhostRoleDetails('ghostRoles', payload) ?? []);
  } catch (err) {
    console.error('[Ghost Roles Proxy]:', err);
    return json({ error: `SAP ghost-roles endpoint unreachable: ${err.message}` }, 502);
  }
}
