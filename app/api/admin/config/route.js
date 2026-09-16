import { NextResponse } from 'next/server';
import { pool } from '../../../../lib/server/db.js';

export async function GET() {
  try {
    // Fetch all plans
    const { rows: plans } = await pool.query('SELECT * FROM plans ORDER BY id');
    
    // Fetch all checks (tiles)
    const { rows: checks } = await pool.query('SELECT key, label FROM checks ORDER BY sort_order');

    // Fetch plan tiles mapping
    const { rows: planTiles } = await pool.query('SELECT * FROM plan_tiles');

    return NextResponse.json({
      success: true,
      plans,
      checks,
      planTiles
    });
  } catch (error) {
    console.error('Failed to fetch config:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { planId, tileKey, isEnabled } = await req.json();

    await pool.query(`
      INSERT INTO plan_tiles (plan_id, tile_key, is_enabled)
      VALUES ($1, $2, $3)
      ON CONFLICT (plan_id, tile_key) 
      DO UPDATE SET is_enabled = EXCLUDED.is_enabled
    `, [planId, tileKey, isEnabled]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update config:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
