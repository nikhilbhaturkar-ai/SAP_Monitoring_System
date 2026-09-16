import { NextResponse } from 'next/server';
import { pool } from '../../../../lib/server/db.js';

export async function GET() {
  try {
    const { rows: users } = await pool.query(`
      SELECT u.id, u.username, u.name, u.role, u.plan_id, p.name as plan_name
      FROM users u
      LEFT JOIN plans p ON u.plan_id = p.id
      ORDER BY u.id
    `);

    return NextResponse.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { userId, planId } = await req.json();

    await pool.query(`
      UPDATE users SET plan_id = $1 WHERE id = $2
    `, [planId, userId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update user plan:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
