import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const base = process.env.APP_URL ?? 'http://localhost:3000';
let cookie = '';
async function post(path, body) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240000),
  });
  const set = response.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  assert(response.ok, `${path}: HTTP ${response.status}`);
  return response;
}
const resolved = await (await post('/api/resolve', { text: 'Fexofenadine' })).json();
const { runId } = await (await post('/api/dossier', resolved.candidates[0])).json();
console.log('Dossier ready; running jury', runId);
const events = (await (await post('/api/jury', { runId })).text())
  .split('\n')
  .filter(Boolean)
  .map(JSON.parse);
const verdict = events.findLast((event) => event.t === 'verdict')?.verdict;
assert(verdict, JSON.stringify(events.filter((event) => event.t === 'error')));
assert.equal(verdict.decision?.provider, 'openai-decisions');
assert.equal(verdict.call, verdict.decision.choice);
assert.equal(verdict.percent.go + verdict.percent.caution + verdict.percent.nogo, 100);
assert.equal(verdict.confidence, Math.round(verdict.decision.confidence * 100));
const savedResponse = await fetch(`${base}/api/runs/${runId}`, { headers: { cookie } });
assert(savedResponse.ok);
const saved = await savedResponse.json();
assert.deepEqual(saved.verdict.decision, verdict.decision);
assert.equal(verdict.transcript.length, 6);
const report = {
  checkedAt: new Date().toISOString(),
  runId,
  subject: 'Fexofenadine',
  call: verdict.call,
  percent: verdict.percent,
  decision: verdict.decision,
  turns: verdict.transcript.length,
  restored: true,
};
await writeFile('data/evaluation/decisions-smoke.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
