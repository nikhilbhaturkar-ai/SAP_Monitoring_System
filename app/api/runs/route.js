import { NextResponse } from 'next/server';
import * as repo from '../../../lib/server/repositories/monitoring.js';
import { windowDaysFrom } from '../_util.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    return NextResponse.json(await repo.listRunDates(windowDaysFrom(searchParams, 30)));
  } catch (err) {
    return NextResponse.json({ error: err.message || 'internal server error' }, { status: 500 });
  }
}
