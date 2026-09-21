import { NextResponse } from 'next/server';
import { pool } from '../../../../lib/server/db.js';

function formatAssignedSystems(val) {
  if (!val) return 'ALL';
  if (Array.isArray(val)) {
    if (val.length === 0 || val.includes('ALL') || val.includes('All')) {
      return 'ALL';
    }
    return val.join(',');
  }
  return String(val);
}

/**
 * GET /api/admin/users
 * Returns list of all users with plan details and assigned systems.
 */
export async function GET() {
  try {
    const { rows: users } = await pool.query(`
      SELECT u.id, u.username, u.name, u.role, u.email, u.avatar, u.plan_id, u.assigned_systems, p.name as plan_name
      FROM users u
      LEFT JOIN plans p ON u.plan_id = p.id
      ORDER BY u.id ASC
    `);

    return NextResponse.json({
      success: true,
      users: users.map(u => ({
        ...u,
        assigned_systems: u.assigned_systems || 'ALL'
      }))
    });
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * Helper to generate 2-letter avatar initials from a full name.
 */
function getInitials(name) {
  if (!name) return 'US';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * POST /api/admin/users
 * Creates a new user or updates user plan/systems if inline payload passed.
 */
export async function POST(req) {
  try {
    const body = await req.json();

    // Check if simplified inline plan or systems update
    if (body.userId && !body.username) {
      if (body.planId !== undefined) {
        await pool.query(`
          UPDATE users SET plan_id = $1 WHERE id = $2
        `, [body.planId ? parseInt(body.planId) : null, body.userId]);
      }
      if (body.assignedSystems !== undefined) {
        const sysStr = formatAssignedSystems(body.assignedSystems);
        await pool.query(`
          UPDATE users SET assigned_systems = $1 WHERE id = $2
        `, [sysStr, body.userId]);
      }
      return NextResponse.json({ success: true });
    }

    const { username, password, name, role, email, planId, assignedSystems } = body;

    if (!username || !username.trim() || !password || !name || !name.trim() || !role) {
      return NextResponse.json(
        { success: false, error: 'Username, password, name, and role are required fields.' },
        { status: 400 }
      );
    }

    // Check username uniqueness
    const { rows: existing } = await pool.query(
      `SELECT id FROM users WHERE LOWER(username) = LOWER($1)`,
      [username.trim()]
    );
    if (existing.length > 0) {
      return NextResponse.json(
        { success: false, error: `Username "${username.trim()}" is already taken.` },
        { status: 400 }
      );
    }

    const avatar = getInitials(name);
    const parsedPlanId = planId ? parseInt(planId) : null;
    const sysStr = formatAssignedSystems(assignedSystems);

    const { rows: inserted } = await pool.query(`
      INSERT INTO users (username, password, name, role, email, avatar, plan_id, assigned_systems)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, username, name, role, email, avatar, plan_id, assigned_systems
    `, [
      username.trim(),
      password,
      name.trim(),
      role.trim(),
      email ? email.trim() : null,
      avatar,
      parsedPlanId,
      sysStr
    ]);

    return NextResponse.json({ success: true, user: inserted[0] });
  } catch (error) {
    console.error('Failed to create user:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/admin/users
 * Updates existing user details.
 */
export async function PUT(req) {
  try {
    const { id, username, password, name, role, email, planId, assignedSystems } = await req.json();

    if (!id) {
      return NextResponse.json({ success: false, error: 'User ID is required' }, { status: 400 });
    }

    if (!username || !username.trim() || !name || !name.trim() || !role) {
      return NextResponse.json(
        { success: false, error: 'Username, name, and role are required.' },
        { status: 400 }
      );
    }

    // Check username uniqueness against other users
    const { rows: existing } = await pool.query(
      `SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2`,
      [username.trim(), id]
    );
    if (existing.length > 0) {
      return NextResponse.json(
        { success: false, error: `Username "${username.trim()}" is already used by another account.` },
        { status: 400 }
      );
    }

    const avatar = getInitials(name);
    const parsedPlanId = planId ? parseInt(planId) : null;
    const sysStr = formatAssignedSystems(assignedSystems);

    if (password && password.trim() !== '') {
      await pool.query(`
        UPDATE users
        SET username = $1, password = $2, name = $3, role = $4, email = $5, avatar = $6, plan_id = $7, assigned_systems = $8
        WHERE id = $9
      `, [username.trim(), password.trim(), name.trim(), role.trim(), email ? email.trim() : null, avatar, parsedPlanId, sysStr, id]);
    } else {
      await pool.query(`
        UPDATE users
        SET username = $1, name = $2, role = $3, email = $4, avatar = $5, plan_id = $6, assigned_systems = $7
        WHERE id = $8
      `, [username.trim(), name.trim(), role.trim(), email ? email.trim() : null, avatar, parsedPlanId, sysStr, id]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update user:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/users
 * Deletes a user by id.
 */
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    let userId = searchParams.get('id');

    if (!userId) {
      try {
        const body = await req.json();
        userId = body.id || body.userId;
      } catch (e) {
        // body might be empty if using URL params
      }
    }

    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID is required' }, { status: 400 });
    }

    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete user:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
