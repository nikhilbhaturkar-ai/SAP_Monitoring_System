import { NextResponse } from 'next/server';
import { pool } from '../../../../lib/server/db.js';

export async function GET() {
  try {
    const { rows } = await pool.query('SELECT key, value FROM system_settings');
    
    const settingsMap = {};
    rows.forEach(r => {
      settingsMap[r.key] = r.value;
    });

    return NextResponse.json({
      success: true,
      settings: {
        enableEmailNotifications: settingsMap['enable_email_notifications'] === 'true',
        sendCriticalAfterHours: settingsMap['send_critical_after_hours'] === 'true',
        refreshInterval: settingsMap['refresh_interval_mins'] ? parseInt(settingsMap['refresh_interval_mins']) : 15,
        officeHoursStart: settingsMap['office_hours_start'] || '09:00',
        officeHoursEnd: settingsMap['office_hours_end'] || '18:00',
        officeHoursTimezone: settingsMap['office_hours_timezone'] || 'Asia/Kolkata',
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
    const {
      enableEmailNotifications,
      sendCriticalAfterHours,
      refreshInterval,
      officeHoursStart,
      officeHoursEnd,
      officeHoursTimezone
    } = body;

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

      if (sendCriticalAfterHours !== undefined) {
        await upsert('send_critical_after_hours', sendCriticalAfterHours ? 'true' : 'false');
      }

      if (refreshInterval !== undefined) {
        await upsert('refresh_interval_mins', String(refreshInterval));
      }

      if (officeHoursStart !== undefined) {
        await upsert('office_hours_start', officeHoursStart);
      }

      if (officeHoursEnd !== undefined) {
        await upsert('office_hours_end', officeHoursEnd);
      }

      if (officeHoursTimezone !== undefined) {
        await upsert('office_hours_timezone', officeHoursTimezone);
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
