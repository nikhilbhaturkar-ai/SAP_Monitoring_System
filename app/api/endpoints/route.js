import { NextResponse } from 'next/server';
import * as repo from '../../../lib/server/repositories/monitoring.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rows = await repo.getUrlStatuses(searchParams.get('date') || null);
    return NextResponse.json(
      rows.map((row) => ({
        sid: row.sid,
        name: row.name,
        host: row.host,
        url: row.url,
        reachable: /accessable|accessible/i.test(row.raw_value || ''),
        raw: row.raw_value,
      }))
    );
  } catch (err) {
    return NextResponse.json({ error: err.message || 'internal server error' }, { status: 500 });
  }
}
