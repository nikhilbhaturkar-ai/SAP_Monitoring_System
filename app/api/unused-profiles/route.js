/**
 * Live proxy for the SAP unused-profiles endpoint.
 * Used by the Unused Profiles dialog to refresh its list after a profile is
 * deleted — the dashboard payload only reflects the last collection cycle.
 * Rows are shaped by the same mapper the collector uses, so the dialog's
 * table spec reads them identically.
 */
import { config } from '../../../lib/server/config.js';
import { toUnusedProfileDetails } from '../../../lib/server/sap/mappers.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAP_UNUSED_PROFILES_URL =
  'http://mpcls4hdevapp.mpower.com.qa:8000/sap/bc/abap/z_unused_profil/unusedprofiles?sap-client=100';

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
    const upstream = await fetch(SAP_UNUSED_PROFILES_URL, {
      headers,
      signal: AbortSignal.timeout(config.sap.timeoutMs),
    });
    if (!upstream.ok) {
      return json({ error: `SAP unused-profiles endpoint returned HTTP ${upstream.status}` }, upstream.status);
    }
    const payload = await upstream.json();
    // No UNUSED_PROFILES array means nothing is left — an empty list, not an error.
    return json(toUnusedProfileDetails('unusedProfiles', payload) ?? []);
  } catch (err) {
    console.error('[Unused Profiles Proxy]:', err);
    return json({ error: `SAP unused-profiles endpoint unreachable: ${err.message}` }, 502);
  }
}
