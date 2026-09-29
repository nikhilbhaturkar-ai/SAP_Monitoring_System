import { NextResponse } from 'next/server';
import { pool } from '../../../lib/server/db.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM system_settings WHERE key = 'company_logo_url'"
    );
    return NextResponse.json({ logoUrl: rows[0]?.value || null });
  } catch {
    return NextResponse.json({ logoUrl: null });
  }
}
