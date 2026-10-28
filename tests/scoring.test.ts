import { describe, it, expect } from 'vitest';
import { normalize, finalize, cleanTurn } from '../lib/scoring';
import { DossierSchema, SubjectSchema, type Dossier, type Turn } from '../lib/types';
const subject = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'small_molecule' as const,
  title: 'Test molecule',
  question: 'Advance?',
  components: [{ key: 'c0', role: 'ligand' as const, name: 'Test molecule', smiles: 'CCO' }],
  origin: 'smiles' as const,
  understood: 'Test molecule',
  confidence: 'high' as const,
};
const dossier: Dossier = {
  version: 2,
  subject,
  evidence: [
    {
      id: 'E1',
      source: 'RDKit',
      kind: 'alert',
      text: 'Structural alert',
      domains: ['chemist'],
      componentKey: 'c0',
      quality: 'heuristic',
      retrievedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  anchors: [{ id: 'c0:overview', label: 'Overview', componentKey: 'c0', type: 'overview' }],
  drivers: [],
  prior: { go: 34, caution: 33, nogo: 33 },
  coverage: 50,
  structure: [],
  sources: [],
  chemistry: {},
  createdAt: '2026-01-01T00:00:00.000Z',
};
const turn = (role: Turn['role'], votes = { go: 80, caution: 10, nogo: 10 }): Turn => ({
  role,
  ...votes,
  say: 'Evidence statement',
  confidence: 70,
  cites: [],
  anchor: 'none',
  target: 'none',
  verified: 0,
  totalCites: 0,
  round: 'opening',
});
describe('deterministic voting', () => {
  it('uses largest remainders, always summing to exactly 100', () => {
    for (let i = 0; i < 1000; i++) {
      const v = normalize({ go: Math.sin(i) * 100, caution: i % 101, nogo: Math.cos(i) * 80 });
      expect(v.go + v.caution + v.nogo).toBe(100);
      expect(Object.values(v).every((x) => x >= 0 && x <= 100 && Number.isInteger(x))).toBe(true);
    }
    expect(normalize({ go: 1, caution: 1, nogo: 4 })).toEqual({ go: 17, caution: 17, nogo: 66 });
  });
  it('handles non-finite and zero votes', () => {
    expect(normalize({ go: NaN, caution: Infinity, nogo: -20 })).toEqual({
      go: 34,
      caution: 33,
      nogo: 33,
    });
  });
  it('replaces previous votes after rebuttal, instead of counting both', () => {
    const a = turn('chemist');
    const b = { ...turn('chemist', { go: 5, caution: 15, nogo: 80 }), round: 'rebuttal' as const };
    const x = finalize([a, b], dossier.prior, 50, []);
    expect(x.percent).toEqual(finalize([b], dossier.prior, 50, []).percent);
    expect(x.call).toBe('NO_GO');
  });
  it('normalizes confidence to 0–1 before weighting', () => {
    const ts = [
      { ...turn('chemist'), confidence: 100 },
      { ...turn('toxicologist', { go: 0, caution: 0, nogo: 100 }), confidence: 0 },
    ];
    const v = finalize(ts, dossier.prior, 100, []);
    expect(v.percent.nogo).toBeGreaterThan(20);
    expect(v.percent.go + v.percent.caution + v.percent.nogo).toBe(100);
  });
  it('reduces confidence when evidence coverage is thin', () => {
    const ts = [turn('chemist'), turn('chair')];
    expect(finalize(ts, dossier.prior, 10, []).confidence).toBeLessThan(
      finalize(ts, dossier.prior, 90, []).confidence,
    );
    expect(finalize(ts, dossier.prior, 10, []).evidenceGrade).toBe('LOW');
  });
});
describe('evidence integrity', () => {
  it('drops unknown and out-of-role citations and anchors', () => {
    const raw = {
      say: 'A fact [E1], invention [E99]',
      go: 100,
      caution: 100,
      nogo: 100,
      confidence: 999,
      cites: ['[E1]', 'E99'],
      anchor: 'fake',
      target: 'hacker',
    };
    const t = cleanTurn(raw, 'chemist', 'opening', dossier);
    expect(t.cites).toEqual(['E1']);
    expect(t.verified).toBe(1);
    expect(t.totalCites).toBe(2);
    expect(t.say).not.toContain('[E99]');
    expect(t.anchor).toBe('none');
    expect(t.confidence).toBe(100);
    expect(cleanTurn(raw, 'pharmacologist', 'opening', dossier).cites).toEqual([]);
  });
  it('rejects duplicate component and evidence IDs', () => {
    expect(
      SubjectSchema.safeParse({
        ...subject,
        kind: 'mixture',
        components: [subject.components[0], subject.components[0]],
      }).success,
    ).toBe(false);
    expect(
      DossierSchema.safeParse({ ...dossier, evidence: [...dossier.evidence, ...dossier.evidence] })
        .success,
    ).toBe(false);
  });
  it('rejects drivers referencing nonexistent evidence', () => {
    expect(
      DossierSchema.safeParse({
        ...dossier,
        drivers: [{ label: 'Fake', delta: 10, toward: 'GO', evidenceIds: ['E99'] }],
      }).success,
    ).toBe(false);
  });
  it('rejects unsafe evidence URL schemes', () => {
    expect(
      DossierSchema.safeParse({
        ...dossier,
        evidence: [{ ...dossier.evidence[0], url: 'javascript:alert(1)' }],
      }).success,
    ).toBe(false);
  });
});
