/**
 * Proxy for the SAP unused-profile delete endpoint.
 * Avoids CORS — the browser talks to this Next.js server only.
 * Body: { "PROFILE": "<PROFILE>" }, e.g. { "PROFILE": "T-MD370030" }.
 * SAP answers 201 on success.
 */
import { config } from '../../../lib/server/config.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAP_PROFILE_DELETE_URL =
  'http://mpcls4hdevapp.mpower.com.qa:8000/sap/bc/abap/z_unusepro_d/delprof?sap-client=100';

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

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const profile = typeof body?.PROFILE === 'string' ? body.PROFILE.trim() : '';
  if (!profile) return json({ error: 'PROFILE is required' }, 400);

  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const auth = buildAuthHeader();
  if (auth) headers['Authorization'] = auth;

  try {
    const upstream = await fetch(SAP_PROFILE_DELETE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ PROFILE: profile }),
      signal: AbortSignal.timeout(config.sap.timeoutMs),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err) {
    console.error('[Profile Delete Proxy]:', err);
    return json({ error: `SAP profile-delete endpoint unreachable: ${err.message}` }, 502);
  }
}
