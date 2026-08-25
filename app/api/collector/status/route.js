import { NextResponse } from 'next/server';
import { listCollectorRuns } from '../../../../lib/server/services/collector.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Math.trunc(Number(searchParams.get('limit')) || 20), 1), 200);
    return NextResponse.json(await listCollectorRuns(limit));
  } catch (err) {
    return NextResponse.json({ error: err.message || 'internal server error' }, { status: 500 });
  }
}
