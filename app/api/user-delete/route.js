/**
 * Proxy for the SAP user-delete (unlock) endpoint.
 * Avoids CORS — the browser talks to this Next.js server only.
 */
import { config } from '../../../lib/server/config.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAP_USER_DELETE_URL =
  'http://mpcls4hdevapp.mpower.com.qa:8000/sap/bc/abap/z_user_unlock_p/user?sap-client=100&sap-language=EN';

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

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const auth = buildAuthHeader();
  if (auth) headers['Authorization'] = auth;

  try {
    const upstream = await fetch(SAP_USER_DELETE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.sap.timeoutMs),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err) {
    console.error('[User Delete Proxy]:', err);
    return new Response(
      JSON.stringify({ error: `SAP user-delete endpoint unreachable: ${err.message}` }),
      { status: 502, headers: { 'content-type': 'application/json' } }
    );
  }
}
