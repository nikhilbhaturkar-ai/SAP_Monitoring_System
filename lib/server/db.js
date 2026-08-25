import pg from 'pg';
import { config } from './config.js';

// NUMERIC comes back as a string by default; the dashboard wants numbers.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
// DATE as a plain ISO day, free of timezone drift.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

// A dev-mode Next.js server hot-reloads route handler modules on every
// request; without caching the pool on globalThis, each reload would open a
// fresh pg.Pool and leak connections. Production has one long-lived module
// instance, so this is a no-op there.
const globalForPg = globalThis;

export const pool =
  globalForPg.__sapMonitoringPgPool ??
  new pg.Pool({ connectionString: config.databaseUrl });

if (process.env.NODE_ENV !== 'production') {
  globalForPg.__sapMonitoringPgPool = pool;
}

export function query(text, params) {
  return pool.query(text, params);
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
