import { NextResponse } from 'next/server';
import { buildTrend } from '../../../../../../lib/server/services/dashboard.js';
import { windowDaysFrom } from '../../../../_util.js';

export async function GET(request, { params }) {
  try {
    const { sid, checkKey } = await params;
    const { searchParams } = new URL(request.url);
    const data = await buildTrend(sid.toUpperCase(), checkKey, windowDaysFrom(searchParams, 30));
    return NextResponse.json(data);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    return NextResponse.json({ error: err.message || 'internal server error' }, { status });
  }
}
