import { readFile, writeFile, mkdir } from 'node:fs/promises';
const base = process.env.APP_URL ?? 'http://localhost:3000';
const seeds = JSON.parse(await readFile('data/seeds.json', 'utf8'));
let cookie = '';
async function post(path, body) {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240000),
  });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(await r.json())}`);
  return r;
}
const results = [];
for (const seed of seeds) {
  const start = Date.now();
  console.log('Evaluating', seed.name);
  try {
    const resolved = await (
      await post('/api/resolve', { text: seed.hypothetical ? seed.codename : seed.pubchemName })
    ).json();
    const { runId, dossier } = await (await post('/api/dossier', resolved.candidates[0])).json();
    const stream = await (await post('/api/jury', { runId })).text();
    const events = stream.split('\n').filter(Boolean).map(JSON.parse);
    const verdict = events.findLast((e) => e.t === 'verdict')?.verdict;
    if (!verdict)
      throw new Error(
        events
          .filter((e) => e.t === 'error')
          .map((e) => e.msg)
          .join('; '),
      );
    const row = {
      id: seed.id,
      name: seed.name,
      expected: seed.truth.verdict,
      actual: verdict.call,
      percent: verdict.percent,
      coverage: dossier.coverage,
      citations: verdict.citationsVerified,
      turns: verdict.transcript.length,
      runId,
      structure: dossier.structure.map((s) => s.mode),
      seconds: Math.round((Date.now() - start) / 1000),
    };
    results.push(row);
    console.log(JSON.stringify(row));
  } catch (e) {
    results.push({ id: seed.id, name: seed.name, error: e.message });
    console.error('FAILED', seed.name, e.message);
  }
  await mkdir('data/evaluation', { recursive: true });
  await writeFile(
    'data/evaluation/live.json',
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: 'Full live dossier and OpenAI jury; no ground-truth verdicts sent to the models.',
        results,
      },
      null,
      2,
    ),
  );
}
const complete = results.filter((r) => r.actual);
const accuracy = complete.filter((r) => r.actual === r.expected).length / (complete.length || 1);
console.log(
  `Full-jury gold accuracy: ${Math.round(accuracy * 100)}% (${complete.length}/${seeds.length} completed).`,
);
