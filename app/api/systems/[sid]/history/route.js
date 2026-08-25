import { NextResponse } from 'next/server';
import { buildHistory } from '../../../../../lib/server/services/dashboard.js';
import { windowDaysFrom } from '../../../_util.js';

export async function GET(request, { params }) {
  try {
    const { sid } = await params;
    const { searchParams } = new URL(request.url);
    const data = await buildHistory(sid.toUpperCase(), windowDaysFrom(searchParams, 60));
    return NextResponse.json(data);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    return NextResponse.json({ error: err.message || 'internal server error' }, { status });
  }
}
