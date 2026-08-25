import { NextResponse } from 'next/server';
import { query } from '../../../lib/server/db.js';
import * as repo from '../../../lib/server/repositories/monitoring.js';

export async function GET() {
  try {
    const { rows } = await query('SELECT now() AS db_time');
    const latest = await repo.getLatestRunDate();
    return NextResponse.json({ status: 'ok', dbTime: rows[0].db_time, latestRun: latest });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'internal server error' }, { status: 500 });
  }
}
