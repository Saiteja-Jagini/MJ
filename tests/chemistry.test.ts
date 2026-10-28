import { beforeAll, describe, it, expect } from 'vitest';
import { serverRDKit, validateMolecule, compatibleConformer } from '../lib/chem/server';
import { analyze } from '../lib/chem/analyze';
import seeds from '../data/seeds.json';
import { splitComposition, sniff } from '../lib/sniff';
import { proteinAnchors } from '../lib/structures';
let rd: any;
beforeAll(async () => {
  rd = await serverRDKit();
});
describe('reference chemistry acceptance tests', () => {
  it('parses all twelve reference structures', () => {
    for (const s of seeds) expect(analyze(rd, s.smiles), s.name).not.toBeNull();
  });
  it('flags terfenadine hERG pattern but not fexofenadine', () => {
    expect(analyze(rd, seeds[7].smiles)?.alerts.map((a) => a.id)).toContain('herg_pattern');
    expect(analyze(rd, seeds[8].smiles)?.alerts.map((a) => a.id)).not.toContain('herg_pattern');
  });
  it.each([
    [4, ['tzd']],
    [10, ['nitro_arom', 'michael']],
    [11, ['catechol', 'ene_rhodanine']],
    [9, ['imid']],
  ])('finds expected alerts in case %i', (index, expected) => {
    const alerts = analyze(rd, seeds[index as number].smiles)?.alerts.map((a) => a.id);
    for (const id of expected as string[]) expect(alerts).toContain(id);
  });
  it('matches indices against the displayed molblock', () => {
    const m = rd.get_mol(seeds[7].smiles);
    const block = m.get_molblock();
    m.delete();
    const result = analyze(rd, block)!;
    const displayed = rd.get_mol(block);
    const n = displayed.get_num_atoms();
    displayed.delete();
    expect(result.alerts.some((a) => a.id === 'herg_pattern')).toBe(true);
    for (const a of result.alerts)
      for (const match of a.matches) expect(match.atoms.every((i) => i >= 0 && i < n)).toBe(true);
  });
  it('rejects malformed ring closure', async () => {
    await expect(validateMolecule('C1CC')).rejects.toThrow();
  });
  it('accepts explicit hydrogens without accepting a different structure or enantiomer', () => {
    const m = rd.get_mol('CCO');
    const withH = m.add_hs();
    m.delete();
    expect(compatibleConformer(rd, 'CCO', withH)).toBe(true);
    expect(compatibleConformer(rd, 'CCN', withH)).toBe(false);
    const chiral = rd.get_mol('N[C@H](C)C(=O)O');
    const block = chiral.get_molblock();
    chiral.delete();
    expect(compatibleConformer(rd, 'N[C@@H](C)C(=O)O', block)).toBe(false);
  });
});
describe('intake parsing', () => {
  it('does not split charged SMILES at + inside square brackets', () => {
    expect(splitComposition('C[N+](C)(C)C')).toEqual(['C[N+](C)(C)C']);
    expect(splitComposition('paracetamol 500mg + caffeine 65mg')).toHaveLength(2);
  });
  it('identifies common structured input types', () => {
    expect(sniff('1IEP')).toBe('pdbid');
    expect(sniff('P00519')).toBe('uniprot');
    expect(sniff('>test\nMALKLAFS')).toBe('fasta');
  });
  it('never invents protein residue anchors without a verified mapping', () => {
    const anchors = proteinAnchors(
      { key: 'c0', role: 'target', name: 'test' },
      {
        componentKey: 'c0',
        mode: 'pdb',
        format: 'pdb',
        text: 'ATOM      1  CA  ALA A  10      11.000  12.000  13.000',
        provenance: 'test',
      },
      {
        sequence: { value: 'RRRRRRRRRR' },
        features: [{ type: 'Binding site', location: { start: { value: 10 } } }],
      },
    );
    expect(anchors).toEqual([]);
  });
});
