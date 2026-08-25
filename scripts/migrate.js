import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../lib/server/db.js';
import { config } from '../lib/server/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.resolve(here, '..', 'db');

async function run() {
  console.log(`> connecting to ${config.databaseUrl.replace(/:[^:@/]+@/, ':***@')}`);

  for (const file of ['schema.sql', 'seed.sql']) {
    const sql = await fs.readFile(path.join(dbDir, file), 'utf8');
    await pool.query(sql);
    console.log(`> applied ${file}`);
  }

  const { rows } = await pool.query(
    'SELECT (SELECT count(*) FROM systems) AS systems, (SELECT count(*) FROM checks) AS checks'
  );
  console.log(`> ready: ${rows[0].systems} systems, ${rows[0].checks} checks`);
}

run()
  .catch((err) => {
    console.error('migration failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
