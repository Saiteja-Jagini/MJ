import { Pool } from 'pg';
import { databaseConnectionString } from '../lib/db/connection';
if (!databaseConnectionString)
  throw new Error('Set DATABASE_URL or POSTGRES_URL to a reachable PostgreSQL connection string.');
const p = new Pool({ connectionString: databaseConnectionString });
async function main() {
  try {
    const r = await p.query(
      'SELECT current_database() AS database, version(), (SELECT count(*) FROM analysis_runs) AS analyses',
    );
    console.log(r.rows[0]);
  } finally {
    await p.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
