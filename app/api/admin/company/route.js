import { NextResponse } from 'next/server';
import { pool } from '../../../../lib/server/db.js';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM system_settings WHERE key = 'company_logo_url'"
    );
    return NextResponse.json({ success: true, logoUrl: rows[0]?.value || null });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('logo');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ success: false, error: 'Only image files are allowed (PNG, JPG, GIF, WebP, SVG)' }, { status: 400 });
    }

    const ext = file.name.split('.').pop().toLowerCase();
    const filename = `company-logo.${ext}`;
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    await writeFile(path.join(uploadsDir, filename), Buffer.from(bytes));

    const logoUrl = `/uploads/${filename}`;

    await pool.query(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('company_logo_url', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [logoUrl]);

    return NextResponse.json({ success: true, logoUrl });
  } catch (err) {
    console.error('Logo upload failed:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await pool.query("DELETE FROM system_settings WHERE key = 'company_logo_url'");
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
