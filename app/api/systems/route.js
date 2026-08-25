import { NextResponse } from 'next/server';
import * as repo from '../../../lib/server/repositories/monitoring.js';

export async function GET() {
  try {
    const systems = await repo.listSystems();
    return NextResponse.json({
      sap: systems.filter((s) => s.kind === 'sap'),
      endpoints: systems.filter((s) => s.kind === 'url'),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'internal server error' }, { status: 500 });
  }
}
