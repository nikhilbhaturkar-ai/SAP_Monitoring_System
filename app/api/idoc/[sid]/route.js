import { NextResponse } from 'next/server';
import { config } from '../../../../lib/server/config.js';

// Only these two SIDs expose the IDoc monitoring endpoint, each on its own
// SAP client number baked into the Z-service path.
const IDOC_PATH = {
  MSD:     '/sap/bc/abap/z_idoc_mon/idoc?sap-client=100',
  MSD_150: '/sap/bc/abap/z_idoc_mon/idoc?sap-client=150',
};

export async function GET(_req, { params }) {
  const { sid } = await params;
  const upperSid = sid.toUpperCase();

  const path = IDOC_PATH[upperSid];
  if (!path) {
    return NextResponse.json(
      { error: `IDoc monitoring is not available for ${upperSid}` },
      { status: 404 }
    );
  }

  const base = config.sap.baseUrls[upperSid];
  if (!base) {
    return NextResponse.json(
      { error: `No SAP base URL configured for ${upperSid} — set SAP_BASE_URL_${upperSid} in .env` },
      { status: 503 }
    );
  }

  const url = `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

  const headers = { Accept: 'application/json' };
  const { authMode, username, password, token } = config.sap;
  if (authMode === 'basic' && username && password) {
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  } else if (authMode === 'bearer' && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(config.sap.timeoutMs),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `SAP returned HTTP ${response.status} ${response.statusText}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    const message =
      err.name === 'TimeoutError'
        ? `Request to SAP timed out after ${config.sap.timeoutMs}ms`
        : (err.message ?? 'Unknown error');
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
