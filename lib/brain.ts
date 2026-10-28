import { z } from 'zod';
const fp = z.string().regex(/^[01]{2048}$/);
export const ModelsSchema = z.record(
  z.object({
    auc: z.number().min(0).max(1),
    n: z.number().int().positive(),
    intercept: z.number().finite(),
    coef: z.array(z.number().finite()).length(2048),
    train_fps: z.array(fp).min(1),
    source: z.string().optional(),
    split: z.string().optional(),
  }),
);
export const PrecedentsSchema = z.array(
  z.object({
    name: z.string().nullable(),
    label: z.enum(['approved', 'withdrawn', 'tox_failed']),
    smi: z.string(),
    fp,
    source: z.string().optional(),
    chemblId: z.string().optional(),
  }),
);
export type Models = z.infer<typeof ModelsSchema>;
export type Precedents = z.infer<typeof PrecedentsSchema>;
export interface ToxResult {
  p: number;
  auc: number;
  inDomain: boolean;
  maxSim: number;
  n: number;
}
export function tanimotoBits(a: string, b: string) {
  let i = 0,
    u = 0;
  for (let k = 0; k < a.length; k++) {
    const x = a[k] === '1',
      y = b[k] === '1';
    if (x && y) i++;
    if (x || y) u++;
  }
  return u ? i / u : 0;
}
export function fingerprint(rd: any, smiles: string): string {
  const m = rd.get_mol(smiles);
  if (!m) throw new Error('Invalid molecular fingerprint input.');
  try {
    return fp.parse(
      m.get_morgan_fp(JSON.stringify({ radius: 2, nBits: 2048, useChirality: false })),
    );
  } finally {
    m.delete();
  }
}
export function toxProbs(f: string, models: Models): Record<string, ToxResult> {
  const out: Record<string, ToxResult> = {};
  for (const [k, m] of Object.entries(models)) {
    let z = m.intercept;
    for (let i = 0; i < 2048; i++) if (f[i] === '1') z += m.coef[i];
    let maxSim = 0;
    for (const t of m.train_fps) maxSim = Math.max(maxSim, tanimotoBits(f, t));
    out[k] = { p: 1 / (1 + Math.exp(-z)), auc: m.auc, inDomain: maxSim >= 0.3, maxSim, n: m.n };
  }
  return out;
}
export function nearest(f: string, prec: Precedents, k = 3) {
  return prec
    .map((p) => ({ ...p, sim: tanimotoBits(f, p.fp) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k);
}
