import { NextResponse } from 'next/server';
import * as repo from '../../../../../lib/server/repositories/monitoring.js';

export async function GET(_request, { params }) {
  try {
    const { sid } = await params;
    const runs = await repo.listRunDatesForSystem(sid.toUpperCase());
    return NextResponse.json(runs);
  } catch (err) {
    return NextResponse.json({ error: err.message || 'internal server error' }, { status: 500 });
  }
}
