/**
 * Reverse proxy to the Batch Job Monitor's separate FastAPI backend
 * (batch-monitor-backend/), mirroring what server/src/index.js did with
 * http-proxy-middleware. Mounted so the browser only ever talks to this
 * Next.js app; SSE responses (…/stream) are passed through unbuffered.
 */
import { config } from '../../../../lib/server/config.js';

export const runtime = 'nodejs';
// SSE connections are long-lived; make sure this route is never statically
// cached or pre-rendered.
export const dynamic = 'force-dynamic';

// Hop-by-hop headers that must not be forwarded either direction.
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

function filteredHeaders(headers) {
  const out = new Headers();
  for (const [key, value] of headers.entries()) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) out.set(key, value);
  }
  return out;
}

async function proxy(request, { params }) {
  const { path } = await params;
  const targetUrl = new URL(
    `/${(path ?? []).join('/')}`,
    config.batchMonitorUrl
  );
  targetUrl.search = new URL(request.url).search;

  const init = {
    method: request.method,
    headers: filteredHeaders(request.headers),
    // GET/HEAD must not carry a body.
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    duplex: ['GET', 'HEAD'].includes(request.method) ? undefined : 'half',
  };

  let upstream;
  try {
    upstream = await fetch(targetUrl, init);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `batch monitor backend unreachable: ${err.message}` }),
      { status: 502, headers: { 'content-type': 'application/json' } }
    );
  }

  // Stream the body straight through — critical for the SSE /stream endpoint,
  // which must never be buffered.
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: filteredHeaders(upstream.headers),
  });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
  proxy as OPTIONS,
};
