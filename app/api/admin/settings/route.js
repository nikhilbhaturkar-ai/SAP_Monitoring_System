import { NextResponse } from 'next/server';
import { pool } from '../../../../lib/server/db.js';

export async function GET() {
  try {
    const { rows } = await pool.query('SELECT key, value FROM system_settings');

    const s = {};
    rows.forEach(r => { s[r.key] = r.value; });

    return NextResponse.json({
      success: true,
      settings: {
        enableEmailNotifications: s['enable_email_notifications'] === 'true',
        refreshInterval: s['refresh_interval_mins'] ? parseInt(s['refresh_interval_mins']) : 15,
        dailyEmailHour: s['daily_email_hour'] ? parseInt(s['daily_email_hour']) : 8,
        dailyEmailTimezone: s['daily_email_timezone'] || 'Asia/Kolkata',
        alertCheckKeys: s['alert_check_keys'] ? s['alert_check_keys'].split(',').filter(Boolean) : [],
      }
    });
  } catch (error) {
    console.error('Failed to fetch system settings:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { enableEmailNotifications, refreshInterval, dailyEmailHour, dailyEmailTimezone, alertCheckKeys } = body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const upsert = async (key, val) => {
        await client.query(`
          INSERT INTO system_settings (key, value, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `, [key, val]);
      };

      if (enableEmailNotifications !== undefined) {
        await upsert('enable_email_notifications', enableEmailNotifications ? 'true' : 'false');
      }
      if (refreshInterval !== undefined) {
        await upsert('refresh_interval_mins', String(refreshInterval));
      }
      if (dailyEmailHour !== undefined) {
        await upsert('daily_email_hour', String(dailyEmailHour));
      }
      if (dailyEmailTimezone !== undefined) {
        await upsert('daily_email_timezone', dailyEmailTimezone);
      }
      if (alertCheckKeys !== undefined) {
        await upsert('alert_check_keys', Array.isArray(alertCheckKeys) ? alertCheckKeys.join(',') : '');
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update system settings:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
