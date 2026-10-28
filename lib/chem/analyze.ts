import { ALERTS, HERG_RULE } from './alerts';
import type { AlertHit, ChemResult } from '../types';

const num = (x: any) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export function analyze(RDKit: any, smiles: string): ChemResult | null {
  const mol = RDKit.get_mol(smiles);
  if (!mol || (mol.is_valid && !mol.is_valid())) { mol?.delete?.(); return null; }
  try {
    const d = JSON.parse(mol.get_descriptors());
    const mw = num(d.amw ?? d.exactmw), logp = num(d.CrippenClogP), tpsa = num(d.tpsa);
    const hbd = num(d.NumHBD ?? d.lipinskiHBD), hba = num(d.NumHBA ?? d.lipinskiHBA), rotb = num(d.NumRotatableBonds);
    const lipinskiViolations =
      (mw != null && mw > 500 ? 1 : 0) + (logp != null && logp > 5 ? 1 : 0) +
      (hbd != null && hbd > 5 ? 1 : 0) + (hba != null && hba > 10 ? 1 : 0);

    const hits: Record<string, AlertHit> = {};
    for (const a of ALERTS) {
      try {
        const q = RDKit.get_qmol(a.smarts);
        const raw = JSON.parse(mol.get_substruct_matches(q));
        q.delete();
        const matches = Array.isArray(raw) ? raw : [];
        if (matches.length) { const { smarts, ...rest } = a; hits[a.id] = { ...rest, matches }; }
      } catch (e) { console.warn('bad SMARTS', a.id, e); }
    }
    // derived hERG heuristic
    if (hits.basic_amine && !hits.cooh && logp != null && logp > HERG_RULE.logpMin) {
      hits.herg_pattern = {
        id: 'herg_pattern', label: 'hERG-liability pattern (basic amine + lipophilic, no acid)', severity: 'warn',
        why: 'Lipophilic basic amines often block the hERG channel (QT risk). Heuristic, not a measurement.',
        matches: hits.basic_amine.matches,
      };
    }
    const alerts = Object.values(hits).filter((h) => !h.helper);
    return { canonical: mol.get_smiles(), mw, logp, tpsa, hbd, hba, rotb, lipinskiViolations, alerts };
  } finally { mol.delete(); }
}

export function tanimoto(RDKit: any, a: string, b: string): number | null {
  try {
    const ma = RDKit.get_mol(a), mb = RDKit.get_mol(b);
    const opts = JSON.stringify({ radius: 2, nBits: 1024 });
    const fa: string = ma.get_morgan_fp(opts), fb: string = mb.get_morgan_fp(opts);
    ma.delete(); mb.delete();
    let both = 0, either = 0;
    for (let i = 0; i < fa.length; i++) { const x = fa[i] === '1', y = fb[i] === '1'; if (x && y) both++; if (x || y) either++; }
    return either ? both / either : null;
  } catch { return null; }
}
