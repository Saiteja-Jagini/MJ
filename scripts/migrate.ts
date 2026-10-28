import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
const p = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const c = await p.connect();
  try {
    await c.query('BEGIN');
    await c.query(readFileSync('migrations/0001_initial.sql', 'utf8'));
    await c.query(readFileSync('migrations/0002_general_research.sql', 'utf8'));
    await c.query('COMMIT');
    console.log('Database migration complete.');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
    await p.end();
  }
}
main().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exitCode = 1;
});
