import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { serverRDKit } from '../lib/chem/server';
import { analyze } from '../lib/chem/analyze';
import { loadBrain } from '../lib/brain-server';
import { fingerprint, toxProbs, nearest } from '../lib/brain';
import { scoreDrivers, winner } from '../lib/scoring';
import type { Driver } from '../lib/types';
import seeds from '../data/seeds.json';
async function main() {
  const rd = await serverRDKit();
  const brain = await loadBrain();
  if (!brain) throw new Error('Verified model artifacts are required for evaluation.');
  const prior = (smiles: string) => {
    const chem = analyze(rd, smiles);
    if (!chem) throw new Error('Invalid reference structure');
    const drivers: Driver[] = [];
    const add = (label: string, delta: number, toward: Driver['toward']) =>
      drivers.push({ label, delta, toward, evidenceIds: [] });
    chem.alerts
      .filter((a) => a.severity === 'danger')
      .slice(0, 2)
      .forEach((a) => add(a.id, -18, 'NO_GO'));
    chem.alerts
      .filter((a) => a.severity === 'warn' && a.id !== 'herg_pattern')
      .slice(0, 3)
      .forEach((a) => add(a.id, -6, 'CAUTION'));
    if (chem.alerts.some((a) => a.id === 'herg_pattern')) add('hERG pattern', -10, 'NO_GO');
    if (chem.lipinskiViolations >= 2) add('Lipinski', -8, 'CAUTION');
    const fp = fingerprint(rd, smiles);
    const tox = toxProbs(fp, brain.models);
    for (const [k, t] of Object.entries(tox))
      if (t.inDomain) {
        if (t.p > 0.6) add(k, -Math.round(30 * (t.p - 0.5)), 'NO_GO');
        else if (t.p < 0.3) add(k, 6, 'GO');
      }
    for (const n of nearest(fp, brain.precedents))
      if (n.sim > 0.6)
        add(
          'precedent',
          n.label === 'approved' ? Math.round(12 * n.sim) : -Math.round(15 * n.sim),
          n.label === 'approved' ? 'GO' : 'NO_GO',
        );
    add('No live potency retrieval in offline evaluation', -8, 'CAUTION');
    return { votes: scoreDrivers(drivers), tox };
  };
  const matrix: Record<string, Record<string, number>> = {
    GO: { GO: 0, CAUTION: 0, NO_GO: 0 },
    CAUTION: { GO: 0, CAUTION: 0, NO_GO: 0 },
    NO_GO: { GO: 0, CAUTION: 0, NO_GO: 0 },
  };
  const cases = seeds.map((s) => {
    const p = prior(s.smiles);
    const call = winner(p.votes);
    matrix[s.truth.verdict][call]++;
    return { name: s.name, expected: s.truth.verdict, actual: call, ...p.votes };
  });
  const goldAccuracy = cases.filter((c) => c.expected === c.actual).length / cases.length;
  const holdout = JSON.parse(await readFile('public/brain/holdout.json', 'utf8')).slice(0, 200) as {
    smiles: string;
    label: number;
  }[];
  let correct = 0;
  const binary = { tp: 0, tn: 0, fp: 0, fn: 0 };
  for (const row of holdout) {
    const result = prior(row.smiles);
    const pred = result.tox.clintox.p >= 0.5 ? 1 : 0;
    if (pred === row.label) correct++;
    binary[pred ? (row.label ? 'tp' : 'fp') : row.label ? 'fn' : 'tn']++;
  }
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'Offline rules + trained models + precedents. No live retrieval or LLM calls. Not full-jury accuracy.',
    goldAccuracy,
    cases,
    confusionMatrix: matrix,
    clintoxHoldout: {
      n: holdout.length,
      accuracy: correct / holdout.length,
      binary,
      auc: brain.models.clintox.auc,
      endpoint: 'CT_TOX toxicity classification; not GO/CAUTION/NO_GO truth',
    },
  };
  console.table(cases);
  console.log('Offline gold-set accuracy:', (100 * goldAccuracy).toFixed(1) + '%');
  console.table(matrix);
  console.log('ClinTox holdout:', report.clintoxHoldout);
  await mkdir('data/evaluation', { recursive: true });
  await writeFile('data/evaluation/offline.json', JSON.stringify(report, null, 2));
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
