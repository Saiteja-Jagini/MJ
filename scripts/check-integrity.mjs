import { Pool } from 'pg';
const p = new Pool({ connectionString: process.env.DATABASE_URL });
const c = await p.connect();
try {
  const {
    rows: [run],
  } = await c.query(
    'SELECT id,session_id,dossier FROM analysis_runs ORDER BY created_at DESC LIMIT 1',
  );
  if (!run) throw new Error('Run a saved analysis before checking integrity.');
  await c.query('BEGIN');
  let rejected = false;
  try {
    await c.query('INSERT INTO debate_turns(run_id,sequence,role,data) VALUES($1,9999,$2,$3)', [
      run.id,
      'chemist',
      JSON.stringify({ go: 80, caution: 80, nogo: 20 }),
    ]);
  } catch (e) {
    rejected = e.code === '23514';
  }
  await c.query('ROLLBACK');
  if (!rejected) throw new Error('The database accepted an invalid vote total.');
  const unauthorized = await fetch(`http://localhost:3000/api/runs/${run.id}`);
  if (unauthorized.status !== 404) throw new Error('Cross-session read was not rejected.');
  const fake = { ...run.dossier.subject, id: '00000000-0000-4000-8000-000000000000' };
  const response = await fetch('http://localhost:3000/api/dossier', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `mj-session=${run.session_id}` },
    body: JSON.stringify(fake),
  });
  if (response.status !== 422) throw new Error('Unresolved subject was not rejected.');
  console.log(
    'PASS: database rejects invalid votes; cross-session read blocked; unverified subject identity rejected.',
  );
} finally {
  c.release();
  await p.end();
}
