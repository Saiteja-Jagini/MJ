import { Pool } from 'pg';
const p = new Pool({ connectionString: process.env.DATABASE_URL });
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
