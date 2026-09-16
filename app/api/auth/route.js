import { NextResponse } from 'next/server';
import { pool } from '../../../lib/server/db.js';

export async function POST(req) {
  try {
    const { userId, password } = await req.json();

    const { rows } = await pool.query(`
      SELECT u.*, p.name as plan_name 
      FROM users u
      LEFT JOIN plans p ON u.plan_id = p.id
      WHERE u.username = $1 AND u.password = $2
    `, [userId, password]);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid User ID or Password' },
        { status: 401 }
      );
    }

    const user = rows[0];

    // Get enabled tiles for the user's plan
    const { rows: tilesRows } = await pool.query(`
      SELECT tile_key 
      FROM plan_tiles 
      WHERE plan_id = $1 AND is_enabled = true
    `, [user.plan_id]);

    const enabledTiles = tilesRows.map(r => r.tile_key);

    return NextResponse.json({
      success: true,
      user: {
        userId: user.username,
        name: user.name,
        role: user.role,
        email: user.email,
        avatar: user.avatar,
        planId: user.plan_id,
        planName: user.plan_name,
        enabledTiles: enabledTiles
      }
    });

  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
