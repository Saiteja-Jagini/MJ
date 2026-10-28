import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ModelsSchema, PrecedentsSchema, fingerprint, type Models, type Precedents } from './brain';
import { serverRDKit } from './chem/server';
let cache: { models: Models; precedents: Precedents } | null = null;
export async function loadBrain() {
  if (cache) return cache;
  try {
    const read = async (name: string) =>
      JSON.parse(await readFile(path.join(process.cwd(), 'public/brain', name), 'utf8'));
    const [models, precedents, parity] = await Promise.all([
      read('tox_models.json'),
      read('precedents.json'),
      read('parity.json'),
    ]);
    const rd = await serverRDKit();
    if (fingerprint(rd, parity.smiles) !== parity.fp) throw new Error('Fingerprint parity failed');
    cache = { models: ModelsSchema.parse(models), precedents: PrecedentsSchema.parse(precedents) };
    return cache;
  } catch {
    return null;
  }
}
