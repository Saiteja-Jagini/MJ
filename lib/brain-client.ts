'use client';
import { getRDKit } from './rdkit';
import { analyze } from './chem/analyze';
import { ModelsSchema, PrecedentsSchema, fingerprint, toxProbs, nearest } from './brain';
import type { Subject } from './types';
let artifacts: Promise<{
  models: ReturnType<typeof ModelsSchema.parse>;
  precedents: ReturnType<typeof PrecedentsSchema.parse>;
  parity: { smiles: string; fp: string };
}> | null = null;
async function load() {
  if (!artifacts)
    artifacts = Promise.all(
      ['tox_models.json', 'precedents.json', 'parity.json'].map(async (file) => {
        const r = await fetch(`/brain/${file}`);
        if (!r.ok) throw new Error('Local model artifacts are unavailable');
        return r.json();
      }),
    ).then(([models, precedents, parity]) => ({
      models: ModelsSchema.parse(models),
      precedents: PrecedentsSchema.parse(precedents),
      parity,
    }));
  return artifacts;
}
export async function browserAnalysis(subject: Subject) {
  if (!subject.components.some((c) => c.smiles)) return { components: 0, models: 0 };
  const [rd, brain] = await Promise.all([getRDKit(), load()]);
  if (fingerprint(rd, brain.parity.smiles) !== brain.parity.fp)
    throw new Error('Browser fingerprint parity failed');
  let components = 0;
  for (const c of subject.components) {
    if (!c.smiles) continue;
    const result = analyze(rd, c.molblock ?? c.smiles);
    if (!result) throw new Error('Browser chemistry validation failed');
    const fp = fingerprint(rd, c.smiles);
    toxProbs(fp, brain.models);
    nearest(fp, brain.precedents);
    components++;
  }
  return { components, models: Object.keys(brain.models).length };
}
