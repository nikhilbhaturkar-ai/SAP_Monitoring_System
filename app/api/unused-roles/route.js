/**
 * Proxy for the SAP unused/unassigned roles endpoint.
 * Avoids CORS — the browser talks to this Next.js server only.
 */
import { config } from '../../../lib/server/config.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAP_UNUSED_ROLES_URL =
  'http://mpcls4hdevapp.mpower.com.qa:8000/sap/bc/abap/z_unused_roles/unusedroles';
const SAP_CLIENT = '100';

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

export async function GET(request) {
  const incoming = new URL(request.url);
  const targetUrl = new URL(SAP_UNUSED_ROLES_URL);
  targetUrl.searchParams.set('sap-client', SAP_CLIENT);
  targetUrl.searchParams.set('sap-language', 'EN');

  const headers = { Accept: 'application/json' };
  const auth = buildAuthHeader();
  if (auth) headers['Authorization'] = auth;

  try {
    const upstream = await fetch(targetUrl.toString(), {
      headers,
      signal: AbortSignal.timeout(config.sap.timeoutMs),
    });

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err) {
    console.error('[Unused Roles Proxy]:', err);
    return new Response(
      JSON.stringify({ error: `SAP unused-roles endpoint unreachable: ${err.message}` }),
      { status: 502, headers: { 'content-type': 'application/json' } }
    );
  }
}
