import { NextResponse } from 'next/server';
import * as repo from '../../../lib/server/repositories/monitoring.js';

export async function GET() {
  try {
    return NextResponse.json(await repo.listChecks());
  } catch (err) {
    return NextResponse.json({ error: err.message || 'internal server error' }, { status: 500 });
  }
}
